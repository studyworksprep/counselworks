import { defineConfig, devices } from "@playwright/test";

// E2E tests run against an already-running app (npm run dev / npm run start
// or a deployed preview) pointed to by E2E_BASE_URL. The golden-path suite
// is the regression gate defined in docs/FIX_PLAN.md; it drives real Clerk
// dev-instance sign-ins and self-skips when the Clerk keys are not
// configured (setup in docs/E2E.md).
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // The golden path is one serial scenario with shared state — one worker.
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  // No retries: the suite is serial and stateful; a mid-scenario retry would
  // rerun steps against half-mutated data.
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
