import Stripe from "stripe";

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
