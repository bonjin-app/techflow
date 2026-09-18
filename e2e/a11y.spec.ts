import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { samplePages } from "./pages";

/**
 * The build audit checks what I thought to check. axe checks what the WCAG
 * working group thought to check, which is a much longer list and not one I
 * can hold in my head.
 */
for (const route of samplePages()) {
  test(`${route} has no accessibility violations`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const report = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    expect(report, `${route}\n${report.join("\n")}`).toEqual([]);
  });
}
