import { devices, expect, test } from "@playwright/test";
import { allPages, at } from "./pages";

/**
 * A phone-sized viewport, checking the failure that keeps coming back: a grid
 * column left as `auto` sizes to its content's max-content width, so one wide
 * child pushes the whole document sideways instead of scrolling inside its own
 * box. It has happened twice, in two unrelated components, which is why this
 * sweeps a spread of the real site rather than a hand-written list.
 */
test.use({ ...devices["Pixel 7"] });

for (const route of allPages()) {
  test(`${route} does not scroll sideways on a phone`, async ({ page }) => {
    // `networkidle`, not `domcontentloaded`: the graphs render after hydration
    // and they are the widest things on the site — a node page was measured at
    // 629 of its 837 elements, /explore at 203 of 1,918, so the sweep was
    // looking for a wide element with the wide elements still missing.
    await page.goto(at(route), { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${route} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  });
}

test("the header navigation stays reachable on a phone", async ({ page }) => {
  await page.goto(at("/"));
  // The nav scrolls horizontally inside its own bar rather than wrapping.
  const nav = page.getByRole("navigation", { name: "Primary mobile" });
  await expect(nav).toBeVisible();
  expect(await nav.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test("the mind map centres itself rather than starting at its left edge", async ({ page }) => {
  await page.goto(at("/map?focus=redis"));
  await expect(page.getByRole("group", { name: /Mind map centred on Redis/ })).toBeVisible();
  const centred = await page.evaluate(() => {
    const wrap = document.querySelector("div.overflow-x-auto");
    if (!wrap) return null;
    const max = wrap.scrollWidth - wrap.clientWidth;
    return max > 0 ? Math.abs(wrap.scrollLeft - max / 2) < 8 : true;
  });
  expect(centred, "the centre node must be on screen").toBe(true);
});

test("a long page can be navigated on a phone, not only scrolled", async ({ page }) => {
  await page.goto(at("/concept/sharding"));
  // Nine screens of content on this viewport, and the sidebar contents list is
  // hidden below `lg` — without this a reader has no overview and no way to jump.
  const contents = page.locator("details").first();
  await expect(contents).toBeVisible();
  await expect(contents).not.toHaveAttribute("open", /.*/); // collapsed, not in the way

  await contents.getByRole("group").or(page.locator("summary").first()).click();
  await expect(contents.getByRole("link", { name: "Visual", exact: true })).toBeVisible();

  await contents.getByRole("link", { name: "Visual", exact: true }).click();
  await expect(page).toHaveURL(/#visual$/);
  // and it gets out of the way, so the reader lands on the section
  await expect(contents).not.toHaveAttribute("open", /.*/);
});

test("the graph tells a phone reader what a phone can do", async ({ page }) => {
  await page.goto(at("/explore"));
  // Hover is not available here, and the mouse hint was hidden with nothing in
  // its place — so a touch reader was told either the wrong thing or nothing.
  await expect(page.getByText("Drag to move around, tap a node to open it.")).toBeVisible();
  await expect(page.getByText("Hover a node")).toBeHidden();
  // Zoom stays off the touch line: the graph handles one pointer, so pinch does nothing.
  await expect(page.getByText(/wheel to zoom/)).toBeHidden();
  await expect(page.getByText("drag to move · tap a node to open it")).toBeVisible();
});

for (const route of ["/", "/build/ai-application", "/path", "/playground/http", "/concept/sharding"]) {
  test(`${route} has nothing too small to tap`, async ({ page }) => {
    await page.goto(at(route), { waitUntil: "networkidle" });
    // Buttons, disclosures and checkboxes are always presented as tappable, so
    // none of the inline-text exemptions in WCAG 2.5.8 apply to them. A
    // checkbox's target is the label around it, which is how a 16px box can be
    // fine and how these were not: the learning-path ticks had no label padding
    // and were the hardest thing on the page to hit.
    // Polled, not sampled once: a control measured while its client component
    // is still laying out is briefly small, which fails about half the runs
    // under a loaded suite and none on its own.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const out: string[] = [];
            for (const el of document.querySelectorAll("button, summary, input[type=checkbox], input[type=radio]")) {
              const target = el.closest("label") ?? el;
              const r = target.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue; // not on screen
              if (r.width >= 24 && r.height >= 24) continue;
              const name = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30);
              out.push(`${el.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)} "${name}"`);
            }
            return out;
          }),
        { message: `${route} has a target under 24px`, timeout: 10_000 },
      )
      .toEqual([]);
  });
}

test("the overflow sweep measures pages with their widest parts present", async ({ page }) => {
  // What the sweep is for is a wide element pushing the document sideways, and
  // the widest elements here are the graphs — which arrive after hydration. If
  // this ever measures an unrendered page again, the 293 tests above keep
  // passing while looking at two thirds of each one.
  await page.goto(at("/concept/sharding"), { waitUntil: "networkidle" });
  await expect(page.locator("svg[data-tick]")).toHaveCount(1);

  await page.goto(at("/explore"), { waitUntil: "networkidle" });
  const elements = await page.evaluate(() => document.querySelectorAll("*").length);
  expect(elements, "the force layout has not rendered; nothing wide is on the page to catch").toBeGreaterThan(1000);
});
