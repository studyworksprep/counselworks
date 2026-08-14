"use server";

import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { recordAuditEvent } from "../audit";
import {
  createConnectedAccount,
  createOnboardingLink,
} from "../payments/connect";
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
