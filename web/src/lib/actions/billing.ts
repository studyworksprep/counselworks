"use server";

import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { recordAuditEvent } from "../audit";
import {
  createConnectedAccount,
  createOnboardingLink,
  fetchAccountStatus,
} from "../payments/connect";
import { createInvoiceCheckoutSession } from "../payments/checkout";
import { stripeConfigured } from "../payments/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { formatCents } from "../agreements/schedule";
import { signingLinkPath, signingLinkUrl } from "../agreements/links";
import { invoiceBalanceCents } from "../billing/aging";
import {
  adjustmentProblem,
  parseDollarsToCents,
  partialPaymentProblem,
  voidProblem,
} from "../billing/invoices";
import { householdBillingRecipients } from "../billing/notify";
import {
  MANUAL_PAYMENT_METHOD_VALUES,
  PAYMENT_METHOD_LABELS,
} from "../constants/billing";
import { sendInvoiceAdjustedEmail, sendPaymentReceiptEmail } from "../email";
import type { SupabaseClient } from "@supabase/supabase-js";

function permCtx(ctx: { dbUserId: string; firmId: string; role: string }) {
  return {
    userId: ctx.dbUserId,
    firmId: ctx.firmId,
    role: ctx.role,
    assignedStudentIds: [],
  };
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://www.counselworks.io"
  );
}

/**
 * Start (or resume) Stripe Connect onboarding for the firm (fix plan 12.4).
 * Creates the connected account on first use, then always returns a fresh
 * single-use hosted-onboarding link; the client navigates to it.
 */
export async function startStripeOnboarding() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!hasPermission(permCtx(ctx), "manage_firm")) {
    return { error: "Only owners and admins can set up payments" };
  }
  if (!stripeConfigured()) {
    return { error: "Payments are not configured for this environment" };
  }

  const db = getDb();
  const [{ data: settings }, { data: firm }] = await Promise.all([
    db
      .from("firm_settings")
      .select("id, stripe_account_id")
      .eq("firm_id", ctx.firmId)
      .maybeSingle(),
    db.from("firms").select("name, email").eq("id", ctx.firmId).maybeSingle(),
  ]);
  if (!settings) return { error: "Firm settings not found" };

  try {
    let accountId = settings.stripe_account_id as string | null;
    if (!accountId) {
      accountId = await createConnectedAccount({
        firmId: ctx.firmId,
        firmName: firm?.name ?? "Counseling firm",
        email: firm?.email ?? null,
      });
      const { error } = await db
        .from("firm_settings")
        .update({ stripe_account_id: accountId })
        .eq("firm_id", ctx.firmId)
        .is("stripe_account_id", null);
      if (error) return { error: "Failed to save the payment account" };

      await recordAuditEvent(db, {
        firmId: ctx.firmId,
        actorUserId: ctx.dbUserId,
        entityType: "firm_settings",
        entityId: settings.id,
        actionType: "stripe_account_created",
        label: "Stripe payment account created",
      });
    }

    const url = await createOnboardingLink(accountId, appUrl());
    return { url };
  } catch (e) {
    console.error("Stripe onboarding failed:", e);
    return { error: "Could not reach Stripe — try again in a moment" };
  }
}

/**
 * Parent pays an open invoice (fix plan 12.5): creates a Stripe Checkout
 * session on the FIRM's connected account (direct charge — the firm is the
 * merchant of record) and returns the hosted-payment URL. The invoice
 * settles only when the verified webhook confirms the charge. `amountCents`
 * below the remaining balance is a partial payment (post-plan billing
 * adjustments); omitted, the whole balance is charged.
 */
export async function payInvoice(invoiceId: string, amountCents?: number) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (ctx.role !== "parent_guardian") {
    return { error: "Only parents and guardians can pay invoices" };
  }
  if (!stripeConfigured()) {
    return { error: "Online payment is not available right now" };
  }

  const db = getDb();
  const { data: invoice } = await db
    .from("invoices")
    .select(
      "id, family_id, status, amount_cents, paid_cents, credited_cents, invoice_number, installment:installment_id(label)"
    )
    .eq("id", invoiceId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!invoice) return { error: "Invoice not found" };

  // Family membership, exactly like agreement signing.
  const { data: membership } = await db
    .from("family_members")
    .select("id")
    .eq("firm_id", ctx.firmId)
    .eq("family_id", invoice.family_id)
    .eq("user_id", ctx.dbUserId)
    .maybeSingle();
  if (!membership) return { error: "Invoice not found" };

  if (invoice.status === "paid") return { error: "This invoice is already paid" };
  if (invoice.status !== "open") return { error: "This invoice cannot be paid" };
  const balance = invoiceBalanceCents(invoice);
  const payCents = amountCents ?? balance;
  const problem = partialPaymentProblem(payCents, invoice);
  if (problem) return { error: problem };

  const { data: settings } = await db
    .from("firm_settings")
    .select("stripe_account_id")
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!settings?.stripe_account_id) {
    return { error: "Your counselor hasn't enabled online payment yet" };
  }

  try {
    // Live check — Stripe is the source of truth for whether the firm can
    // actually take a charge right now.
    const status = await fetchAccountStatus(settings.stripe_account_id);
    if (!status.chargesEnabled) {
      return { error: "Your counselor hasn't finished payment setup yet" };
    }

    const { data: me } = await db
      .from("users")
      .select("email")
      .eq("id", ctx.dbUserId)
      .maybeSingle();

    const installment = (
      Array.isArray(invoice.installment)
        ? invoice.installment[0]
        : invoice.installment
    ) as { label: string } | null;

    const url = await createInvoiceCheckoutSession({
      stripeAccountId: settings.stripe_account_id,
      invoiceId: invoice.id,
      firmId: ctx.firmId,
      payerUserId: ctx.dbUserId,
      payerEmail: me?.email ?? null,
      invoiceNumber: invoice.invoice_number,
      installmentLabel: installment?.label ?? "Installment",
      amountCents: payCents,
      partial: payCents < balance,
      appUrl: appUrl(),
    });
    return { url };
  } catch (e) {
    console.error("Invoice checkout failed:", e);
    return { error: "Could not start the payment — try again in a moment" };
  }
}

// ---------------------------------------------------------------------------
// Staff adjustments: manual payments, credits, void (post-plan billing)
// ---------------------------------------------------------------------------

interface StaffInvoiceRow {
  id: string;
  family_id: string;
  agreement_id: string;
  status: string;
  amount_cents: number;
  paid_cents: number;
  credited_cents: number;
  invoice_number: string;
  installment: { label: string } | { label: string }[] | null;
  families: { household_name: string } | { household_name: string }[] | null;
  agreement: { signing_token: string | null } | { signing_token: string | null }[] | null;
}

function one<T>(v: T | T[] | null): T | null {
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

/**
 * Money adjustments are an owner/admin action (`manage_billing`, the same
 * gate as payment setup): they change what a household owes.
 */
async function loadInvoiceForAdjustment(
  db: SupabaseClient,
  ctx: { dbUserId: string; firmId: string; role: string },
  invoiceId: string
): Promise<{ invoice: StaffInvoiceRow } | { error: string }> {
  if (!hasPermission(permCtx(ctx), "manage_billing")) {
    return { error: "Only owners and admins can adjust invoices" };
  }
  if (!z.string().uuid().safeParse(invoiceId).success) {
    return { error: "Invoice not found" };
  }
  const { data } = await db
    .from("invoices")
    .select(
      "id, family_id, agreement_id, status, amount_cents, paid_cents, credited_cents, invoice_number, " +
        "installment:installment_id(label), families:family_id(household_name), " +
        "agreement:agreement_id(signing_token)"
    )
    .eq("id", invoiceId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!data) return { error: "Invoice not found" };
  return { invoice: data as unknown as StaffInvoiceRow };
}

/** Every surface that renders this household's invoices or balance. */
function revalidateInvoiceSurfaces(familyId: string, signingToken: string | null) {
  revalidatePath(`/families/${familyId}`);
  revalidatePath(`/families/${familyId}/billing`);
  revalidatePath("/students/[id]", "page"); // Family & Billing summary
  revalidatePath("/students/[id]/family", "page");
  revalidatePath("/family-dashboard");
  revalidatePath("/reports");
  if (signingToken) revalidatePath(signingLinkPath(signingToken));
}

const manualPaymentSchema = z.object({
  amount_cents: z.number().int().positive(),
  method: z.string().refine((m) => MANUAL_PAYMENT_METHOD_VALUES.has(m), "Choose how it was paid"),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the payment date"),
  reference: z.string().trim().max(200).nullable(),
});

/**
 * Record a payment the firm received outside Stripe (check, cash, bank
 * transfer): a payments-ledger row the household sees too, then the
 * invoice's settled totals recompute. Partial amounts are fine; the
 * invoice flips to paid when the balance reaches zero. The household gets
 * the same receipt email a card payment sends.
 */
export async function recordManualPayment(invoiceId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  const loaded = await loadInvoiceForAdjustment(db, ctx, invoiceId);
  if ("error" in loaded) return { error: loaded.error };
  const { invoice } = loaded;

  const cents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  if (cents === null) return { error: "Enter an amount like 1,250.00" };
  const parsed = manualPaymentSchema.safeParse({
    amount_cents: cents,
    method: String(formData.get("method") ?? ""),
    paid_on: String(formData.get("paid_on") ?? ""),
    reference: ((formData.get("reference") as string) || "").trim() || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const problem = adjustmentProblem(parsed.data.amount_cents, invoice);
  if (problem) return { error: problem };

  const { error } = await db.from("payments").insert({
    firm_id: ctx.firmId,
    family_id: invoice.family_id,
    invoice_id: invoice.id,
    amount_cents: parsed.data.amount_cents,
    method: parsed.data.method,
    reference: parsed.data.reference,
    recorded_by_user_id: ctx.dbUserId,
    paid_by_user_id: null,
    // Noon UTC on the chosen day, so the calendar date survives any zone.
    paid_at: `${parsed.data.paid_on}T12:00:00.000Z`,
  });
  if (error) {
    console.error("Manual payment insert failed:", error);
    return { error: "Failed to record the payment" };
  }
  const { error: settleError } = await db.rpc("settle_invoice", {
    p_invoice_id: invoice.id,
  });
  if (settleError) {
    console.error("settle_invoice failed:", settleError);
    return { error: "Payment recorded but the invoice could not be updated — reload and check" };
  }

  const remaining = invoiceBalanceCents({
    ...invoice,
    paid_cents: invoice.paid_cents + parsed.data.amount_cents,
  });
  const family = one(invoice.families);
  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "invoice",
    entityId: invoice.id,
    actionType: remaining === 0 ? "invoice_paid" : "invoice_partially_paid",
    label: `Invoice ${invoice.invoice_number}: ${formatCents(parsed.data.amount_cents)} ${PAYMENT_METHOD_LABELS[parsed.data.method]?.toLowerCase() ?? parsed.data.method} payment recorded for ${family?.household_name ?? "family"}${remaining === 0 ? " (paid in full)" : ` (${formatCents(remaining)} remaining)`}`,
    metadata: { amount_cents: parsed.data.amount_cents, method: parsed.data.method, remaining_cents: remaining },
  });

  await notifyHousehold(db, ctx.firmId, invoice, async (recipient, firmName, viewUrl) =>
    sendPaymentReceiptEmail({
      email: recipient.email,
      firstName: recipient.first_name,
      firmName,
      invoiceNumber: invoice.invoice_number,
      installmentLabel: one(invoice.installment)?.label ?? "Installment",
      amountFormatted: formatCents(parsed.data.amount_cents),
      balanceFormatted: remaining === 0 ? null : formatCents(remaining),
      methodLabel: PAYMENT_METHOD_LABELS[parsed.data.method] ?? parsed.data.method,
      viewUrl,
    })
  );

  revalidateInvoiceSurfaces(invoice.family_id, one(invoice.agreement)?.signing_token ?? null);
  return { success: true, remaining_cents: remaining };
}

/**
 * Credit (write down) part or all of an invoice's remaining balance, with
 * a reason the household sees. Never touches money already received.
 */
export async function creditInvoice(invoiceId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  const loaded = await loadInvoiceForAdjustment(db, ctx, invoiceId);
  if ("error" in loaded) return { error: loaded.error };
  const { invoice } = loaded;

  const cents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  if (cents === null) return { error: "Enter an amount like 250.00" };
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Give a reason — the household sees it" };
  if (reason.length > 500) return { error: "Keep the reason under 500 characters" };
  const problem = adjustmentProblem(cents, invoice);
  if (problem) return { error: problem };

  const { error } = await db.from("invoice_credits").insert({
    firm_id: ctx.firmId,
    family_id: invoice.family_id,
    invoice_id: invoice.id,
    amount_cents: cents,
    reason,
    created_by_user_id: ctx.dbUserId,
  });
  if (error) {
    console.error("Credit insert failed:", error);
    return { error: "Failed to apply the credit" };
  }
  const { error: settleError } = await db.rpc("settle_invoice", {
    p_invoice_id: invoice.id,
  });
  if (settleError) {
    console.error("settle_invoice failed:", settleError);
    return { error: "Credit recorded but the invoice could not be updated — reload and check" };
  }

  const remaining = invoiceBalanceCents({
    ...invoice,
    credited_cents: invoice.credited_cents + cents,
  });
  const family = one(invoice.families);
  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "invoice",
    entityId: invoice.id,
    actionType: "invoice_credited",
    label: `Invoice ${invoice.invoice_number}: ${formatCents(cents)} credited for ${family?.household_name ?? "family"} — ${reason}${remaining === 0 ? " (settled)" : ` (${formatCents(remaining)} remaining)`}`,
    metadata: { amount_cents: cents, remaining_cents: remaining, reason },
  });

  await notifyHousehold(db, ctx.firmId, invoice, async (recipient, firmName, viewUrl) =>
    sendInvoiceAdjustedEmail({
      email: recipient.email,
      firstName: recipient.first_name,
      firmName,
      invoiceNumber: invoice.invoice_number,
      installmentLabel: one(invoice.installment)?.label ?? "Installment",
      kind: "credit",
      amountFormatted: formatCents(cents),
      reason,
      balanceFormatted: remaining === 0 ? null : formatCents(remaining),
      viewUrl,
    })
  );

  revalidateInvoiceSurfaces(invoice.family_id, one(invoice.agreement)?.signing_token ?? null);
  return { success: true, remaining_cents: remaining };
}

/**
 * Void an invoice nothing has been paid against (a paid one is adjusted
 * with a credit instead). The row stays, marked Void with its reason, on
 * every surface — an invoice the household was told about never vanishes.
 */
export async function voidInvoice(invoiceId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  const loaded = await loadInvoiceForAdjustment(db, ctx, invoiceId);
  if ("error" in loaded) return { error: loaded.error };
  const { invoice } = loaded;

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Give a reason — the household sees it" };
  if (reason.length > 500) return { error: "Keep the reason under 500 characters" };
  const problem = voidProblem(invoice);
  if (problem) return { error: problem };

  const { error } = await db
    .from("invoices")
    .update({
      status: "void",
      voided_at: new Date().toISOString(),
      voided_by_user_id: ctx.dbUserId,
      void_reason: reason,
    })
    .eq("id", invoice.id)
    .eq("firm_id", ctx.firmId)
    .eq("status", "open");
  if (error) {
    console.error("Void failed:", error);
    return { error: "Failed to void the invoice" };
  }

  const family = one(invoice.families);
  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "invoice",
    entityId: invoice.id,
    actionType: "invoice_voided",
    label: `Invoice ${invoice.invoice_number} (${formatCents(invoice.amount_cents)}) voided for ${family?.household_name ?? "family"} — ${reason}`,
    metadata: { amount_cents: invoice.amount_cents, reason },
  });

  await notifyHousehold(db, ctx.firmId, invoice, async (recipient, firmName, viewUrl) =>
    sendInvoiceAdjustedEmail({
      email: recipient.email,
      firstName: recipient.first_name,
      firmName,
      invoiceNumber: invoice.invoice_number,
      installmentLabel: one(invoice.installment)?.label ?? "Installment",
      kind: "void",
      reason,
      balanceFormatted: null,
      viewUrl,
    })
  );

  revalidateInvoiceSurfaces(invoice.family_id, one(invoice.agreement)?.signing_token ?? null);
  return { success: true };
}

/** Email every billing recipient of the household; non-fatal like all mail. */
async function notifyHousehold(
  db: SupabaseClient,
  firmId: string,
  invoice: StaffInvoiceRow,
  send: (
    recipient: { email: string; first_name: string },
    firmName: string,
    viewUrl: string | undefined
  ) => Promise<void>
) {
  try {
    const [recipients, { data: firm }] = await Promise.all([
      householdBillingRecipients(db, firmId, invoice.family_id),
      db.from("firms").select("name").eq("id", firmId).maybeSingle(),
    ]);
    const signingToken = one(invoice.agreement)?.signing_token ?? null;
    const viewUrl = signingToken ? signingLinkUrl(signingToken) : undefined;
    for (const r of recipients) {
      await send(r, firm?.name ?? "your counseling firm", viewUrl);
    }
  } catch (e) {
    console.error("Invoice notification email failed (non-fatal):", e);
  }
}
