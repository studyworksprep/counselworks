import Stripe from "stripe";

/**
 * The Stripe payment-provider boundary (fix plan 12.4). Everything Stripe
 * lives under src/lib/payments/ — mirror of the src/lib/agreements/
 * signature-provider isolation, so the provider stays swappable.
 *
 * Test-mode keys are deliberate in every environment until go-live; the
 * platform account is the "CounselWorks" sandbox (see docs/E2E.md for the
 * CI key names).
 */

let stripe: Stripe | null = null;

/** Lazy singleton; fails loudly when the key is missing from the env. */
export function getStripe(): Stripe {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set — add it to the environment " +
          "(Vercel env / CI secrets) before using payment features."
      );
    }
    stripe = new Stripe(key);
  }
  return stripe;
}

/** True when payments are configured in this environment. */
export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
