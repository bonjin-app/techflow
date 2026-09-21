import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { allPages } from "./pages";

// Entrance animations are mid-flight for a few hundred milliseconds after load,
// and an ancestor at opacity 0.65 makes axe report a contrast failure against a
// colour that is actually fine. Reduced motion is a real user setting the site
// already honours, and it makes the measurement deterministic.
test.use({ reducedMotion: "reduce" });

/**
 * The build audit checks what I thought to check. axe checks what the WCAG
 * working group thought to check, which is a much longer list and not one I
 * can hold in my head.
 */
for (const route of allPages()) {
  test(`${route} has no accessibility violations`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const report = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    expect(report, `${route}\n${report.join("\n")}`).toEqual([]);
  });
}
