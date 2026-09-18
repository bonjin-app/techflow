import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the built export, served the way the host serves
 * it — not against `next dev`. A dev server hides export-only failures, which
 * are exactly the ones worth catching before a deploy.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/serve-out.mjs 4321",
    url: "http://localhost:4321/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
