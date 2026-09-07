import { NextResponse } from "next/server";
import Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { getStripe } from "@/lib/payments/client";
import { checkoutSessionMismatch } from "@/lib/payments/checkout";
import { createServerClient } from "@/lib/db/client";
import { recordAuditEvent } from "@/lib/audit";
import { formatCents } from "@/lib/agreements/schedule";
import { signingLinkPath, signingLinkUrl } from "@/lib/agreements/links";
import {
  sendPaymentReceiptEmail,
  sendPaymentReceivedFirmEmail,
} from "@/lib/email";

/**
 * Stripe Connect webhook (fix plan 12.4): checkout.session.completed events
 * from the firms' connected accounts (direct charges) turn into payment
 * records. Under /api/webhooks it is Clerk-exempt by the middleware's
 * public-route list — authentication is the Stripe signature, verified
 * against STRIPE_WEBHOOK_SECRET before anything else runs.
 *
 * Service-role client (allowlisted, see docs/SECURITY.md): like the Clerk
 * webhook, there is no user session here to scope a client — the caller is
 * Stripe. Every write is guarded by the signature check plus the session/
 * invoice/account cross-checks in checkoutSessionMismatch, and every query
 * is explicitly firm-scoped.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set — webhook rejected");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      secret
    );
  } catch (e) {
    console.error("Stripe webhook signature verification failed:", e);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const invoiceId = session.metadata?.counselworks_invoice_id;
  const firmId = session.metadata?.counselworks_firm_id;
  const payerUserId = session.metadata?.counselworks_payer_user_id ?? null;
  // Connect events carry the connected account that owns the object.
  const eventAccountId = event.account ?? "";
  if (!invoiceId || !firmId) {
    // Not a CounselWorks-created session (the connected account can have
    // other Stripe activity) — acknowledge and ignore.
    return NextResponse.json({ received: true });
  }

  interface WebhookInvoiceRow {
    id: string;
    family_id: string;
    status: string;
    amount_cents: number;
    invoice_number: string;
    installment: { label: string } | { label: string }[] | null;
    families: { household_name: string } | { household_name: string }[] | null;
    agreement: { signing_token: string | null } | { signing_token: string | null }[] | null;
  }

  const db = createServerClient();
  const [{ data: invoiceRow }, { data: settings }] = await Promise.all([
    db
      .from("invoices")
      .select(
        "id, family_id, status, amount_cents, invoice_number, " +
          "installment:installment_id(label), families:family_id(household_name), " +
          "agreement:agreement_id(signing_token)"
      )
      .eq("id", invoiceId)
      .eq("firm_id", firmId)
      .maybeSingle(),
    db
      .from("firm_settings")
      .select("stripe_account_id")
      .eq("firm_id", firmId)
      .maybeSingle(),
  ]);
  const invoice = invoiceRow as unknown as WebhookInvoiceRow | null;
  if (!invoice) {
    console.error(`Stripe webhook: unknown invoice ${invoiceId}`);
    return NextResponse.json({ received: true });
  }

  const mismatch = checkoutSessionMismatch(
    {
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      metadata: (session.metadata ?? null) as Record<string, string> | null,
    },
    invoice,
    {
      firmId,
      eventAccountId,
      firmAccountId: settings?.stripe_account_id ?? null,
    }
  );
  if (mismatch) {
    console.error(`Stripe webhook refused for ${invoiceId}: ${mismatch}`);
    // 200: the event is authentic but not actionable; retries won't help.
    return NextResponse.json({ received: true });
  }

  const paidAt = new Date().toISOString();
  const { error: paymentError } = await db.from("payments").insert({
    firm_id: firmId,
    family_id: invoice.family_id,
    invoice_id: invoice.id,
    amount_cents: invoice.amount_cents,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    paid_by_user_id: payerUserId,
    paid_at: paidAt,
  });
  if (paymentError) {
    if (paymentError.code === "23505") {
      // Redelivery of an already-recorded payment — idempotent success.
      return NextResponse.json({ received: true });
    }
    console.error("Stripe webhook: payment insert failed:", paymentError);
    // 500 so Stripe retries a transient database failure.
    return NextResponse.json({ error: "storage failed" }, { status: 500 });
  }

  await db
    .from("invoices")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", invoice.id)
    .eq("firm_id", firmId);

  const installment = (
    Array.isArray(invoice.installment) ? invoice.installment[0] : invoice.installment
  ) as { label: string } | null;
  const family = (
    Array.isArray(invoice.families) ? invoice.families[0] : invoice.families
  ) as { household_name: string } | null;
  const agreementRow = (
    Array.isArray(invoice.agreement) ? invoice.agreement[0] : invoice.agreement
  ) as { signing_token: string | null } | null;
  const signingToken = agreementRow?.signing_token ?? null;

  await recordAuditEvent(db, {
    firmId,
    actorUserId: payerUserId,
    entityType: "invoice",
    entityId: invoice.id,
    actionType: "invoice_paid",
    label: `Invoice ${invoice.invoice_number} paid by ${family?.household_name ?? "family"} (${formatCents(invoice.amount_cents)})`,
  });

  // Receipts to both parties (12.5) — non-fatal, like every email here.
  const amountFormatted = formatCents(invoice.amount_cents);
  try {
    if (payerUserId) {
      const { data: payer } = await db
        .from("users")
        .select("email, first_name")
        .eq("id", payerUserId)
        .maybeSingle();
      if (payer?.email) {
        const { data: firm } = await db
          .from("firms")
          .select("name")
          .eq("id", firmId)
          .maybeSingle();
        await sendPaymentReceiptEmail({
          email: payer.email,
          firstName: payer.first_name ?? "there",
          firmName: firm?.name ?? "your counseling firm",
          invoiceNumber: invoice.invoice_number,
          installmentLabel: installment?.label ?? "Installment",
          amountFormatted,
          // The secure link works with or without an account (12.7).
          viewUrl: signingToken ? signingLinkUrl(signingToken) : undefined,
        });
      }
    }
    const { data: firm } = await db
      .from("firms")
      .select("name, email")
      .eq("id", firmId)
      .maybeSingle();
    if (firm?.email) {
      await sendPaymentReceivedFirmEmail({
        email: firm.email,
        firmName: firm.name ?? "Your firm",
        familyName: family?.household_name ?? "A family",
        invoiceNumber: invoice.invoice_number,
        amountFormatted,
      });
    }
  } catch (e) {
    console.error("Payment receipt email failed (non-fatal):", e);
  }

  revalidatePath(`/families/${invoice.family_id}`);
  revalidatePath(`/families/${invoice.family_id}/billing`);
  revalidatePath("/family-dashboard");
  revalidatePath("/reports"); // staff AR aging (12.6)
  if (signingToken) revalidatePath(signingLinkPath(signingToken)); // 12.7
  return NextResponse.json({ received: true });
}
