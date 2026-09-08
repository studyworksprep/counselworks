import { getStripe } from "./client";
import { invoiceBalanceCents } from "../billing/aging";

/**
 * Stripe Checkout for invoice payment (fix plan 12.5). Sessions are
 * created ON the firm's connected account (direct charge): the firm is
 * the merchant of record, its statement descriptor reaches the parent's
 * card statement, and the funds settle to the firm's own balance — the
 * platform never touches the money.
 */
export async function createInvoiceCheckoutSession(input: {
  stripeAccountId: string;
  invoiceId: string;
  firmId: string;
  payerUserId: string;
  payerEmail: string | null;
  invoiceNumber: string;
  installmentLabel: string;
  amountCents: number;
  /** True when amountCents is less than the invoice's remaining balance. */
  partial?: boolean;
  appUrl: string;
  /**
   * Where Checkout returns the payer: the family dashboard for portal
   * users, the secure signing link for account-less households (12.7).
   * Defaults to the dashboard.
   */
  returnPath?: string;
}): Promise<string> {
  const returnPath = input.returnPath ?? "/family-dashboard";
  const metadata = {
    counselworks_invoice_id: input.invoiceId,
    counselworks_firm_id: input.firmId,
    counselworks_payer_user_id: input.payerUserId,
    // The amount this session was created for — a partial payment is any
    // amount below the balance; the webhook cross-checks it (post-plan
    // billing adjustments).
    counselworks_amount_cents: String(input.amountCents),
  };
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      // Card-only, deliberately: engagement invoices are card payments in
      // v1 (wallets/bank debits can join later). This also pins Checkout
      // to the single-form card layout instead of the payment-method
      // accordion, which the E2E fill depends on.
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: input.amountCents,
            product_data: {
              name: input.partial
                ? `${input.invoiceNumber} — ${input.installmentLabel} (partial payment)`
                : `${input.invoiceNumber} — ${input.installmentLabel}`,
            },
          },
        },
      ],
      ...(input.payerEmail ? { customer_email: input.payerEmail } : {}),
      success_url: `${input.appUrl}${returnPath}?payment=submitted`,
      cancel_url: `${input.appUrl}${returnPath}?payment=canceled`,
      // Metadata on both the session and the payment intent: the webhook
      // reads the session's copy; the intent's copy keeps the linkage
      // visible in the firm's own Stripe dashboard.
      metadata,
      payment_intent_data: { metadata },
    },
    { stripeAccount: input.stripeAccountId }
  );
  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

/**
 * Pure webhook-side guard (unit-tested): a checkout session may record a
 * payment against an invoice only when every linkage and amount agrees.
 * The amount must equal what the session was created for and fit the
 * invoice's remaining balance (partial payments are any amount below it);
 * a session created before amounts were stamped in metadata must equal
 * the full invoice. Redelivery is handled BEFORE this guard by looking the
 * session id up in the payments ledger. Returns null when valid, else the
 * reason to refuse.
 */
export function checkoutSessionMismatch(
  session: {
    payment_status: string | null;
    amount_total: number | null;
    metadata: Record<string, string> | null;
  },
  invoice: {
    id: string;
    status: string;
    amount_cents: number;
    paid_cents?: number;
    credited_cents?: number;
  },
  expected: { firmId: string; eventAccountId: string; firmAccountId: string | null }
): string | null {
  if (session.payment_status !== "paid") {
    return `payment_status is ${session.payment_status}`;
  }
  if (session.metadata?.counselworks_invoice_id !== invoice.id) {
    return "invoice metadata mismatch";
  }
  if (session.metadata?.counselworks_firm_id !== expected.firmId) {
    return "firm metadata mismatch";
  }
  if (
    !expected.firmAccountId ||
    expected.firmAccountId !== expected.eventAccountId
  ) {
    return "event account does not match the firm's connected account";
  }
  if (invoice.status === "void") return "invoice is void";
  if (invoice.status !== "open") return `invoice is ${invoice.status}`;
  const stamped = session.metadata?.counselworks_amount_cents;
  const expectedAmount = stamped ? Number(stamped) : invoice.amount_cents;
  if (session.amount_total !== expectedAmount) {
    return `amount mismatch (${session.amount_total} vs ${expectedAmount})`;
  }
  if (session.amount_total === null || session.amount_total <= 0) {
    return "amount is not positive";
  }
  const balance = invoiceBalanceCents(invoice);
  if (session.amount_total > balance) {
    return `amount exceeds the remaining balance (${session.amount_total} vs ${balance})`;
  }
  return null;
}
