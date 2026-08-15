import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/**
 * Stripe test-sandbox hygiene for the E2E suite (fix plan 12.4).
 *
 * The connect spec creates one real test connected account per run (the
 * app tags each with metadata.counselworks_firm_id). Like the Clerk users
 * before them (see cleanupStaleTestUsers), nothing would ever delete them,
 * so global setup removes stale ones. Only accounts belonging to the
 * FIXTURE firms (a000…/b000… ids from supabase/seed/test-fixtures.sql) are
 * ever touched — real firms' accounts never match. Best-effort: a cleanup
 * hiccup must not fail the gate.
 */

const FIXTURE_FIRM_PREFIXES = ["a0000000-", "b0000000-"];
const STALE_AFTER_MS = 60 * 60 * 1000;

export async function cleanupStaleStripeTestAccounts(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return;
  try {
    const stripe = new Stripe(key);
    const cutoff = Math.floor((Date.now() - STALE_AFTER_MS) / 1000);
    const accounts = await stripe.accounts.list({ limit: 100 });
    let deleted = 0;
    for (const account of accounts.data) {
      const firmId = account.metadata?.counselworks_firm_id ?? "";
      const stale = (account.created ?? 0) < cutoff;
      if (stale && FIXTURE_FIRM_PREFIXES.some((p) => firmId.startsWith(p))) {
        await stripe.accounts.del(account.id);
        deleted++;
      }
    }
    if (deleted > 0) {
      console.log(
        `[e2e] deleted ${deleted} stale Stripe test account(s) from the sandbox`
      );
    }
  } catch (e) {
    console.warn(`[e2e] Stripe test-account cleanup failed (continuing): ${e}`);
  }
}

/**
 * A connected account that can take charges IMMEDIATELY, for the
 * golden-path payment step (fix plan 12.5). Stripe-hosted onboarding
 * cannot be driven deterministically in CI, so this uses the documented
 * test-mode recipe instead: an application-collected account prefilled
 * with the magic verification tokens (address_full_match, DOB 1902-01-01,
 * id 000000000) plus ToS acceptance — charges_enabled comes back true
 * without any browser flow. The UI connect journey stays covered by
 * stripe-connect.spec.ts; this helper only manufactures the END STATE of
 * onboarding for the firm. Tagged with the fixture firm id so the stale
 * cleanup above sweeps it.
 */
export async function createChargesEnabledAccount(
  firmId: string
): Promise<string> {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const account = await stripe.accounts.create({
    controller: {
      requirement_collection: "application",
      fees: { payer: "application" },
      losses: { payments: "application" },
      stripe_dashboard: { type: "none" },
    },
    country: "US",
    email: "e2e-firm+clerk_test@example.com",
    business_type: "individual",
    business_profile: {
      mcc: "8299", // educational services
      url: "https://accessible.stripe.com",
      name: "E2E Counseling",
    },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    individual: {
      first_name: "E2E",
      last_name: "Counselor",
      dob: { day: 1, month: 1, year: 1902 },
      id_number: "000000000",
      email: "e2e-firm+clerk_test@example.com",
      phone: "0000000000",
      address: {
        line1: "address_full_match",
        city: "San Francisco",
        state: "CA",
        postal_code: "94102",
        country: "US",
      },
    },
    // Test bank account: without an external account the requirements hash
    // never fully clears, which holds charges_enabled at false.
    external_account: {
      object: "bank_account",
      country: "US",
      currency: "usd",
      routing_number: "110000000",
      account_number: "000123456789",
    },
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" },
    metadata: { counselworks_firm_id: firmId },
  });

  // Verification with magic tokens is synchronous in test mode, but poll
  // briefly in case capability activation lags a beat.
  let last: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 15; attempt++) {
    const fresh = await stripe.accounts.retrieve(account.id);
    if (fresh.charges_enabled) return account.id;
    last = {
      charges_enabled: fresh.charges_enabled,
      payouts_enabled: fresh.payouts_enabled,
      capabilities: fresh.capabilities,
      requirements: {
        disabled_reason: fresh.requirements?.disabled_reason,
        currently_due: fresh.requirements?.currently_due,
        past_due: fresh.requirements?.past_due,
        pending_verification: fresh.requirements?.pending_verification,
      },
    };
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Test account ${account.id} never reached charges_enabled — ` +
      `state: ${JSON.stringify(last)} — ` +
      "check the test-token recipe against current Stripe docs"
  );
}

/**
 * Point the firm at the given Stripe account directly in the database —
 * E2E setup only, service-role, same spirit as the pre-staged
 * e2e-users.sql rows. The app's own connect flow is exercised separately.
 */
export async function assignFirmStripeAccount(
  firmId: string,
  accountId: string
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service env missing for E2E");
  const db = createClient(url, key);
  const { error } = await db
    .from("firm_settings")
    .update({ stripe_account_id: accountId })
    .eq("firm_id", firmId);
  if (error) throw new Error(`Failed to assign Stripe account: ${error.message}`);
}
