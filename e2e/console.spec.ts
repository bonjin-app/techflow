import { expect, test } from "@playwright/test";
import { at } from "./pages";

/**
 * A hydration mismatch or a crashing client component logs to the console and
 * leaves the page looking fine, so nothing else here would catch it. One page
 * per interactive component, and no page may log an error.
 */
const PAGES = [
  "/",
  "/explore",
  "/map",
  "/path",
  "/you",
  "/technology/redis",
  "/concept/cache",
  "/pattern/cache-aside",
  "/architecture/chat-system",
  "/system-design/ticket-booking",
  "/compare/websocket-vs-sse",
  "/roadmap/backend-developer",
  "/build/ai-application",
  "/stack/modern-saas",
  "/radar",
  "/challenge",
  "/playground/cache",
  "/playground/rate-limiter",
  "/playground/jwt",
  "/api-docs",
  "/search",
];

for (const path of PAGES) {
  test(`${path} renders without console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));

    const response = await page.goto(at(path), { waitUntil: "networkidle" });
    expect(response?.status(), `${path} should be served`).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    expect(errors, `${path} logged errors`).toEqual([]);
  });
}
