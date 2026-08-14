import { getStripe } from "./client";

/**
 * Connect account lifecycle for firms (fix plan 12.4).
 *
 * Controller configuration (Stripe "design an integration", GA v1 API —
 * the v2 Accounts API still requires a preview version, unsuitable for the
 * money path):
 *   - fees.payer = account: Stripe collects its fees from the firm.
 *   - losses.payments = stripe: Stripe manages risk and carries negative
 *     balances — the platform is not liable.
 *   - stripe_dashboard.type = full: the firm gets its own full Stripe
 *     dashboard and is plainly the merchant of record; the parent's card
 *     statement carries the FIRM's descriptor, never the platform's.
 *
 * Country and capabilities are deliberately NOT set: requesting either
 * locks the account's country, and with a full dashboard Stripe requests
 * the right capabilities during hosted onboarding based on the firm's own
 * country selection.
 */

export async function createConnectedAccount(input: {
  firmId: string;
  firmName: string;
  email: string | null;
}): Promise<string> {
  const account = await getStripe().accounts.create({
    controller: {
      fees: { payer: "account" },
      losses: { payments: "stripe" },
      stripe_dashboard: { type: "full" },
    },
    ...(input.email ? { email: input.email } : {}),
    business_profile: { name: input.firmName },
    metadata: { counselworks_firm_id: input.firmId },
  });
  return account.id;
}

/** Hosted-onboarding link (single-use, short-lived). */
export async function createOnboardingLink(
  accountId: string,
  appUrl: string
): Promise<string> {
  const link = await getStripe().accountLinks.create({
    account: accountId,
    // Expired/reused links bounce here; the route mints a fresh link.
    refresh_url: `${appUrl}/api/stripe/connect/refresh`,
    return_url: `${appUrl}/settings`,
    type: "account_onboarding",
    // Up-front collection: everything eventually due is collected in one
    // pass, so the firm isn't interrupted for more paperwork mid-season.
    collection_options: { fields: "eventually_due" },
  });
  return link.url;
}

export interface StripeAccountStatus {
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  currentlyDue: number;
}

/** Live status from Stripe — the source of truth for onboarding state. */
export async function fetchAccountStatus(
  accountId: string
): Promise<StripeAccountStatus> {
  const account = await getStripe().accounts.retrieve(accountId);
  return {
    chargesEnabled: !!account.charges_enabled,
    detailsSubmitted: !!account.details_submitted,
    currentlyDue: account.requirements?.currently_due?.length ?? 0,
  };
}
