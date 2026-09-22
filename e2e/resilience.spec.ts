import { expect, test } from "@playwright/test";
import { allPages, at } from "./pages";

/**
 * Two promises this site makes by being a static export, neither of which any
 * other check would notice breaking: it can be read without JavaScript, and it
 * survives a reader who needs the text twice as large.
 */

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the pages are still readable and still link onwards", async ({ page }) => {
    // Self-check first: the force graph only exists once its simulation has run,
    // so its absence is proof the scripts really are off and this suite is not
    // quietly measuring a hydrated page.
    await page.goto(at("/explore"), { waitUntil: "domcontentloaded" });
    expect(await page.locator("svg[data-tick]").count(), "scripts are running; this proves nothing").toBe(0);

    for (const route of ["/", "/concept/sharding", "/technology/redis", "/compare/rest-vs-graphql", "/roadmap/backend-developer"]) {
      await page.goto(at(route), { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1"), route).toBeVisible();
      const { words, links } = await page.evaluate(() => ({
        words: (document.querySelector("main")?.innerText ?? "").trim().split(/\s+/).length,
        links: document.querySelectorAll("main a[href]").length,
      }));
      expect(words, `${route} has ${words} words without scripts`).toBeGreaterThan(300);
      expect(links, `${route} offers ${links} links without scripts`).toBeGreaterThan(10);
    }
  });
});

test.describe("at twice the text size", () => {
  // Text-only zoom, which is not the same as page zoom: the root font size
  // doubles and the viewport does not, so anything sized in fixed pixels around
  // text that grew is where a layout tears.
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const route of allPages().filter((_, i) => i % 24 === 0)) {
    test(`${route} reflows rather than scrolling sideways`, async ({ page }) => {
      // Settled, not on arrival: this measures horizontal overflow, and the
      // graphs that arrive after hydration are the widest things on the page.
      await page.goto(at(route), { waitUntil: "networkidle" });
      const before = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      const after = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      expect(after, "the zoom did not apply, so this asserts nothing").toBeCloseTo(before * 2, 0);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} overflows by ${overflow}px at 200% text`).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("on paper", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("printing a page does not lose a quarter of it", async ({ page }) => {
    await page.goto(at("/concept/sharding"), { waitUntil: "networkidle" });
    const read = () => page.evaluate(() => (document.getElementById("main")?.innerText ?? "").trim().split(/\s+/).length);

    const onScreen = await read();
    const deepDive = page.locator("#level-panel-1");
    await expect(deepDive).toBeHidden(); // a tab panel, closed

    await page.emulateMedia({ media: "print" });
    // Every depth level reaches the paper — the open tab is not the whole page,
    // and nothing on a printout says another level existed.
    await expect(deepDive).toBeVisible();
    await expect(await read()).toBeGreaterThan(onScreen);
    // …each one saying which it is, now that the tab strip is gone.
    const label = await deepDive.evaluate((el) => getComputedStyle(el, "::before").content);
    expect(label).toContain("Deep dive");

    // And the parts that only work on a screen stay off it: the footer alone
    // ran to a third of a page.
    for (const chrome of ["header", "footer", 'nav[aria-label="On this page"]']) {
      await expect(page.locator(chrome).first(), chrome).toBeHidden();
    }
  });
});
