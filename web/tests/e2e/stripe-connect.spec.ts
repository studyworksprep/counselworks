import { test, expect } from "@playwright/test";
import { e2eEnv } from "./helpers/env";
import { ensureClerkUser, signInAs } from "./helpers/clerk";

/**
 * Firm Stripe onboarding (fix plan 12.4, PR 3a): the owner connects the
 * firm's payment account from Settings. This creates a REAL test connected
 * account in the platform sandbox (cleaned up by global setup, see
 * helpers/stripe.ts) and asserts the redirect into Stripe-hosted
 * onboarding — the hosted flow itself is Stripe's UI and is not driven
 * here. Completing onboarding and paying an invoice arrive with the 12.5
 * golden-path extension.
 */

const env = e2eEnv();
const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;

test.describe("stripe connect onboarding", () => {
  test.skip(!env, "Clerk test-auth env not configured — see docs/E2E.md");
  test.skip(
    !stripeConfigured,
    "STRIPE_SECRET_KEY not set — payments E2E skipped (see docs/E2E.md)"
  );

  test("owner connects the firm's Stripe account and sees resume state", async ({
    page,
  }) => {
    await ensureClerkUser(env!.ownerEmail, "E2E", "Owner");
    await signInAs(page, env!.ownerEmail, "/settings");

    // Fresh database each CI run → the firm starts not-connected.
    await expect(
      page.getByRole("heading", { name: "Payments" })
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Connect Stripe payments" })
      .click();

    // The action creates the connected account, then navigates the browser
    // to Stripe-hosted onboarding.
    await page.waitForURL(/connect\.stripe\.com/, { timeout: 30_000 });

    // Abandon the hosted flow (its UI belongs to Stripe) and return: the
    // live status now reads as connected-but-incomplete.
    await page.goto("/settings");
    await expect(page.getByText("Onboarding incomplete")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Resume onboarding" })
    ).toBeVisible();
  });
});
