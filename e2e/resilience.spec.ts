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
      await page.goto(at(route), { waitUntil: "domcontentloaded" });
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
