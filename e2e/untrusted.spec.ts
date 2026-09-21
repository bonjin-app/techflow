import { expect, test } from "@playwright/test";
import { at } from "./pages";

/**
 * The three places a stranger's text reaches the page: a query in the URL, a
 * pasted token, and the path finder's parameters. React escapes all of it — but
 * the day somebody reaches for `dangerouslySetInnerHTML` to render a snippet,
 * this is what says so, and a static site with no server is exactly where that
 * mistake would go unnoticed.
 */
const MARKUP = `<img src=x onerror="window.__xss=(window.__xss||0)+1">`;
const CLOSER = `</script><script>window.__xss=(window.__xss||0)+1;</script>`;

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __xss: number }).__xss = 0;
  });
  // A payload that opened a dialog instead of setting the counter would
  // otherwise hang the test rather than fail it.
  page.on("dialog", (d) => d.dismiss());
});

const executed = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __xss?: number }).__xss ?? 0);

test("a search query is text, not markup", async ({ page }) => {
  await page.goto(at(`/search?q=${encodeURIComponent(MARKUP)}`), { waitUntil: "networkidle" });
  expect(await executed(page), "the query's markup ran").toBe(0);
  // and it really did reach the page, so this is not passing by not rendering
  await expect(page.locator("body")).toContainText("img src=x");
});

test("a pasted token's claims are text, however they are written", async ({ page }) => {
  await page.goto(at("/playground/jwt"), { waitUntil: "networkidle" });
  await page.locator("textarea").fill(`${b64url({ alg: "none" })}.${b64url({ name: MARKUP, iss: CLOSER })}.sig`);
  await expect(page.getByText("img src=x", { exact: false })).toBeVisible();
  expect(await executed(page), "the pasted token's markup ran").toBe(0);
});

test("path finder parameters are text", async ({ page }) => {
  await page.goto(at(`/path?from=${encodeURIComponent(MARKUP)}&to=${encodeURIComponent(CLOSER)}`), {
    waitUntil: "networkidle",
  });
  expect(await executed(page), "the path parameters' markup ran").toBe(0);
});
