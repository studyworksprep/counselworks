import { getStripe } from "./client";

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
  appUrl: string;
}): Promise<string> {
  const metadata = {
    counselworks_invoice_id: input.invoiceId,
    counselworks_firm_id: input.firmId,
    counselworks_payer_user_id: input.payerUserId,
  };
  const session = await getStripe().checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: input.amountCents,
            product_data: {
              name: `${input.invoiceNumber} — ${input.installmentLabel}`,
            },
          },
        },
      ],
      ...(input.payerEmail ? { customer_email: input.payerEmail } : {}),
      success_url: `${input.appUrl}/family-dashboard?payment=submitted`,
      cancel_url: `${input.appUrl}/family-dashboard?payment=canceled`,
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
 * Pure webhook-side guard (unit-tested): a checkout session may mark an
 * invoice paid only when every linkage and amount agrees. Returns null
 * when valid, else the reason to refuse.
 */
export function checkoutSessionMismatch(
  session: {
    payment_status: string | null;
    amount_total: number | null;
    metadata: Record<string, string> | null;
  },
  invoice: { id: string; status: string; amount_cents: number },
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
  if (session.amount_total !== invoice.amount_cents) {
    return `amount mismatch (${session.amount_total} vs ${invoice.amount_cents})`;
  }
  if (invoice.status === "void") return "invoice is void";
  return null;
}
