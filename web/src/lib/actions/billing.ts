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
 * flips to paid only when the verified webhook confirms the charge.
 */
export async function payInvoice(invoiceId: string) {
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
      "id, family_id, status, amount_cents, invoice_number, installment:installment_id(label)"
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
      amountCents: invoice.amount_cents,
      appUrl: appUrl(),
    });
    return { url };
  } catch (e) {
    console.error("Invoice checkout failed:", e);
    return { error: "Could not start the payment — try again in a moment" };
  }
}
