import { devices, expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * A phone-sized viewport, checking the failure that keeps coming back: a grid
 * column left as `auto` sizes to its content's max-content width, so one wide
 * child pushes the whole document sideways instead of scrolling inside its own
 * box. It has happened twice, in two unrelated components, which is why this
 * sweeps a spread of the real site rather than a hand-written list.
 */
test.use({ ...devices["Pixel 7"] });

/** Every distinct route shape, plus every nth page of the long tails. */
function sample(): string[] {
  const xml = fs.readFileSync(path.join(process.cwd(), "out", "sitemap.xml"), "utf8");
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/")
    .sort();
  const byShape = new Map<string, string[]>();
  for (const p of paths) {
    const shape = p === "/" ? "/" : `/${p.split("/")[1]}`;
    byShape.set(shape, [...(byShape.get(shape) ?? []), p]);
  }
  const picked: string[] = [];
  for (const [, list] of byShape) {
    // the index page of each shape, then a deterministic spread through it
    picked.push(list[0]);
    for (let i = 1; i < list.length; i += Math.max(1, Math.ceil(list.length / 5))) picked.push(list[i]);
  }
  return [...new Set(picked)];
}

for (const route of sample()) {
  test(`${route} does not scroll sideways on a phone`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${route} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  });
}

test("the header navigation stays reachable on a phone", async ({ page }) => {
  await page.goto("/");
  // The nav scrolls horizontally inside its own bar rather than wrapping.
  const nav = page.getByRole("navigation", { name: "Primary mobile" });
  await expect(nav).toBeVisible();
  expect(await nav.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test("the mind map centres itself rather than starting at its left edge", async ({ page }) => {
  await page.goto("/map?focus=redis");
  await expect(page.getByRole("img", { name: /Mind map centred on Redis/ })).toBeVisible();
  const centred = await page.evaluate(() => {
    const wrap = document.querySelector("div.overflow-x-auto");
    if (!wrap) return null;
    const max = wrap.scrollWidth - wrap.clientWidth;
    return max > 0 ? Math.abs(wrap.scrollLeft - max / 2) < 8 : true;
  });
  expect(centred, "the centre node must be on screen").toBe(true);
});
