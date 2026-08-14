import { NextResponse } from "next/server";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { getDb } from "@/lib/db/client";
import { hasPermission } from "@/modules/permissions/service";
import { createOnboardingLink } from "@/lib/payments/connect";

/**
 * Account-Link refresh target (fix plan 12.4): Stripe bounces the firm
 * here when a hosted-onboarding link expires or gets reused. Mint a fresh
 * link and continue, or fall back to Settings. Clerk-gated by the default
 * middleware matcher (not in the public-route list) — only a signed-in
 * user can reach it, and only manage_firm roles get a new link, matching
 * the startStripeOnboarding action.
 */
export async function GET(request: Request) {
  const settingsUrl = new URL("/settings", request.url);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://www.counselworks.io";

  const ctx = await resolveUserAndFirm();
  if (
    !ctx ||
    !hasPermission(
      {
        userId: ctx.dbUserId,
        firmId: ctx.firmId,
        role: ctx.role,
        assignedStudentIds: [],
      },
      "manage_firm"
    )
  ) {
    return NextResponse.redirect(settingsUrl);
  }

  const db = getDb();
  const { data: settings } = await db
    .from("firm_settings")
    .select("stripe_account_id")
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!settings?.stripe_account_id) {
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const url = await createOnboardingLink(settings.stripe_account_id, appUrl);
    return NextResponse.redirect(url);
  } catch (e) {
    console.error("Stripe onboarding link refresh failed:", e);
    return NextResponse.redirect(settingsUrl);
  }
}
