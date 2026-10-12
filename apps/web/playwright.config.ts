import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against mock mode (NEXT_PUBLIC_MOCK=1): every screen renders
 * from fixtures, with no API and no Supabase. That catches crashes, blank
 * panels and broken imports — the bugs that have so far only been found by
 * someone clicking. Flows that need the real database (sign-in, the booking
 * constraint, dispatch) need a seeded Supabase in CI and are not here yet.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Staff and patients both use this on mid-range Android phones.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `next build && next start -p ${PORT}`,
    env: { NEXT_PUBLIC_MOCK: "1", NEXT_DIST_DIR: ".next-e2e" },
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
  },
});
