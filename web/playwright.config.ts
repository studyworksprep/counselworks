import { defineConfig, devices } from "@playwright/test";

// E2E tests run against an already-running app (npm run dev or a deployed
// preview) pointed to by E2E_BASE_URL. The golden-path suite is the
// regression gate defined in docs/FIX_PLAN.md; specs stay `fixme` until the
// feature they cover lands.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
