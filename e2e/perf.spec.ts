import { expect, test } from "@playwright/test";
import { at } from "./pages";

/**
 * `check:build` weighs the bytes a page ships. That is not the same as what the
 * reader feels, so this measures the two things a static site can still get
 * wrong: content that jumps around while it settles, and a main thread held so
 * long that taps go unanswered.
 *
 * Measured at 4x CPU throttling — the usual stand-in for a mid-range phone. The
 * budgets are deliberately far above what the site does today (CLS ~0, blocked
 * ~300ms); they are here to catch a collapse, such as a heavy library pulled
 * into the shared bundle, not to police a few milliseconds.
 */
const ROUTES = ["/", "/concept/sharding", "/explore", "/compare/rest-vs-graphql", "/build/saas", "/search"];

for (const route of ROUTES) {
  test(`${route} settles without jumping or blocking`, async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number; __blocked: number };
      w.__cls = 0;
      w.__blocked = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) {
          if (!e.hadRecentInput) w.__cls += e.value ?? 0;
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__blocked += Math.max(0, e.duration - 50);
      }).observe({ type: "longtask", buffered: true });
    });

    await page.goto(at(route), { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const { cls, blocked } = await page.evaluate(() => {
      const w = window as unknown as { __cls: number; __blocked: number };
      return { cls: w.__cls, blocked: w.__blocked };
    });

    expect(cls, `${route} shifted by ${cls.toFixed(3)} after paint`).toBeLessThan(0.1);
    expect(blocked, `${route} blocked the main thread for ${Math.round(blocked)}ms`).toBeLessThan(900);
  });
}
