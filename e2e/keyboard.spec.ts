import { expect, test } from "@playwright/test";
import { at } from "./pages";

/**
 * What axe cannot see. Every violation here was live: the skip link scrolled
 * without moving focus, Shift+Tab walked out of the modal onto the page behind
 * it, closing the palette dropped the user at the top of the document, and both
 * search boxes moved a highlight that assistive technology was never told about.
 */

/** Whatever the browser currently considers focused, in a form worth reading. */
const focused = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return "none";
    const label = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${label}"`;
  });

test("the skip link is the first tab stop and actually moves focus", async ({ page }) => {
  await page.goto(at("/concept/sharding"));
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveText(/skip to content/i);

  await page.keyboard.press("Enter");
  // Not merely scrolled there: the element itself has to take focus, or a
  // screen reader announces nothing and the next Tab starts from the top.
  expect(await focused(page)).toMatch(/^main#main /);
});

test("the palette keeps focus inside it and hands it back on close", async ({ page }) => {
  await page.goto(at("/concept/sharding"));
  const opener = page.getByRole("button", { name: /search/i }).first();
  await opener.focus();
  await page.keyboard.press("Enter");

  const input = page.getByRole("combobox", { name: "Search the knowledge graph" });
  await expect(input).toBeFocused();

  // Neither direction may land on the page behind the modal.
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(input).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});

for (const { where, url, box } of [
  { where: "the home page search", url: "/", box: "Search TechFlow" },
  { where: "the path finder", url: "/path", box: /from/i },
]) {
  test(`${where} tells assistive technology which option is highlighted`, async ({ page }) => {
    await page.goto(at(url));
    const input = page.getByRole("combobox", { name: box }).first();
    await input.fill("redis");
    await expect(input).toHaveAttribute("aria-activedescendant", /.+/);

    const first = await input.getAttribute("aria-activedescendant");
    await page.keyboard.press("ArrowDown");
    // The highlight moved, so the announced option has to move with it.
    expect(await input.getAttribute("aria-activedescendant")).not.toBe(first);
  });
}

test("the shortcuts are discoverable at all", async ({ page }) => {
  await page.goto(at("/concept/sharding"));
  const panel = page.getByRole("dialog", { name: "Keyboard shortcuts" });

  // The only visible way in, for a reader who does not already know the key.
  const hint = page.getByRole("button", { name: /for shortcuts/i });
  await hint.click();
  await expect(panel).toBeVisible();

  // Every section the header offers is listed with its key, from one source.
  for (const label of ["Technologies", "Concepts", "Mind Map", "Playground"]) {
    await expect(panel.getByText(label, { exact: true })).toBeVisible();
  }

  // Escape closes it and hands focus back, as the palette does.
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(hint).toBeFocused();

  // …and the key itself works, which is the thing the panel is advertising.
  await page.keyboard.press("?");
  await expect(panel).toBeVisible();
});
