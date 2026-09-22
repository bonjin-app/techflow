import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { allPages, at } from "./pages";

// Entrance animations are mid-flight for a few hundred milliseconds after load,
// and an ancestor at opacity 0.65 makes axe report a contrast failure against a
// colour that is actually fine. Reduced motion is a real user setting the site
// already honours, and it makes the measurement deterministic.
test.use({ reducedMotion: "reduce" });

/**
 * The build audit checks what I thought to check. axe checks what the WCAG
 * working group thought to check, which is a much longer list and not one I
 * can hold in my head.
 *
 * `networkidle`, not `domcontentloaded`: the relationship graph and the force
 * layout render after hydration, so auditing on arrival looked at 629 of a node
 * page's 838 elements and 201 of /explore's 1,917. The graphs — the most
 * intricate thing on the site and the likeliest to have a role wrong — were
 * never in the document when axe ran.
 *
 * Themes alternate by position rather than running every page twice. The two
 * classes of violation behave differently: roles, labels and focusability are
 * the same in either theme, so nothing structural is lost, while contrast is a
 * property of the palette rather than of a page, so exercising both themes
 * across the sitemap covers every token pair the site uses. Playwright renders
 * light by default, which is how 290 pages of dark mode went unchecked.
 */
const routes = allPages();


for (const [i, route] of routes.entries()) {
  const scheme = i % 2 === 0 ? "light" : "dark";
  test(`${route} has no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(at(route), { waitUntil: "networkidle" });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const report = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    expect(report, `${route} in ${scheme} mode\n${report.join("\n")}`).toEqual([]);
  });
}

// The home page is the one page almost everyone sees, so it gets both themes
// regardless of where it lands in the alternation.
test("the home page has no accessibility violations (dark)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(at("/"), { waitUntil: "networkidle" });
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});


test("the sweep audits pages with their graphs actually in them", async ({ page }) => {
  // The sweep's value depends entirely on this. Auditing on `domcontentloaded`
  // saw 629 of this page's elements and none of its graph; if that ever comes
  // back, the 292 tests above keep passing while checking less.
  await page.goto(at("/concept/sharding"), { waitUntil: "networkidle" });
  await expect(page.locator("svg[data-tick]")).toHaveCount(1);

  await page.goto(at("/explore"), { waitUntil: "networkidle" });
  const elements = await page.evaluate(() => document.querySelectorAll("*").length);
  expect(elements, "the force layout has not rendered, so the sweep is auditing an empty page").toBeGreaterThan(1000);
});
