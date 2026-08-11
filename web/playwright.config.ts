import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Load web/.env.e2e if present — the local-run contract documented in
// docs/E2E.md. Already-exported variables win, so CI (which passes secrets
// through the environment) is never overridden by a stray local file.
// Hand-rolled rather than pulling in dotenv: this is the only place the
// project needs env-file parsing, and it keeps the test runner dependency-free.
function loadE2EEnvFile(file = ".env.e2e") {
  // Resolved against this config's directory (web/), so the file is found
  // regardless of the cwd the runner was invoked from.
  let raw: string;
  try {
    raw = readFileSync(join(__dirname, file), "utf8");
  } catch {
    return; // absent is normal — the suite then self-skips (or fails loudly in CI)
  }
  for (const line of raw.split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    const value = rawValue.trim();
    const quoted = /^(['"])([\s\S]*)\1\s*$/.exec(value);
    // Only strip a trailing #comment from unquoted values — secrets may
    // legitimately contain '#'.
    process.env[key] = quoted
      ? quoted[2]
      : value.replace(/\s+#.*$/, "").trim();
  }
}

loadE2EEnvFile();

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
