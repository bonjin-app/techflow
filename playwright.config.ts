import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the built export, served the way the host serves
 * it — not against `next dev`. A dev server hides export-only failures, which
 * are exactly the ones worth catching before a deploy.
 */
/**
 * GitHub Pages mounts a project site under /<repo>, and the deploy workflow
 * builds with that prefix. `baseURL` cannot carry it — a leading-slash path
 * discards a base URL's own path — so specs prefix routes with `at()` from
 * e2e/pages.ts instead, and only the readiness probe needs it here.
 */
const BASE = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
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
    url: `http://localhost:4321${BASE}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
