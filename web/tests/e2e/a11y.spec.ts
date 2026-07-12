import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { e2eEnv } from "./helpers/env";
import { ensureClerkUser, signInAs } from "./helpers/clerk";

/**
 * Automated accessibility checks (fix plan 9.9): axe-core over the
 * golden-path staff pages. Runs under the same Clerk test-auth env as the
 * golden-path suite and self-skips without it.
 *
 * Scope: serious/critical violations fail; the full report prints for
 * anything below that.
 */

const env = e2eEnv();

const STAFF_PAGES = [
  "/dashboard",
  "/students",
  "/families",
  "/applications",
  "/calendar",
  "/essays",
  "/messages",
  "/reports",
];

test.describe("accessibility (axe)", () => {
  test.skip(!env, "Clerk test-auth env not configured — see docs/E2E.md");

  test("staff golden-path pages have no serious axe violations", async ({
    page,
  }) => {
    await ensureClerkUser(env!.ownerEmail, "E2E", "Owner");
    await signInAs(page, env!.ownerEmail);

    for (const path of STAFF_PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const serious = results.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? "")
      );
      if (results.violations.length > 0) {
        console.log(
          `[axe] ${path}:`,
          results.violations.map((v) => `${v.id}(${v.impact})`).join(", ")
        );
      }
      expect(
        serious,
        `${path} has serious a11y violations: ${serious
          .map((v) => v.id)
          .join(", ")}`
      ).toEqual([]);
    }
  });
});
