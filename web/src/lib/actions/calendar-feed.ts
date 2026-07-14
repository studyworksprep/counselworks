"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm, isStaffRole } from "../auth/resolve";

/**
 * Read-only ICS feed management (fix plan 10.7). The token gates
 * /api/calendar-feed/[token]; enabling/rotating generates a fresh secret,
 * disabling nulls it (subscriptions stop resolving immediately).
 */

export async function getMyCalendarFeedToken(): Promise<string | null> {
  const ctx = await resolveUserAndFirm();
  if (!ctx || !isStaffRole(ctx.role)) return null;
  const db = getDb();
  const { data } = await db
    .from("users")
    .select("calendar_feed_token")
    .eq("id", ctx.dbUserId)
    .maybeSingle();
  return data?.calendar_feed_token ?? null;
}

/** Enable the feed, or rotate the token if one already exists. */
export async function rotateCalendarFeedToken() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" as const };
  if (!isStaffRole(ctx.role)) return { error: "Not authorized" as const };

  const db = getDb();
  // Respect the firm-wide kill switch (fix plan 11.5).
  const { data: settings } = await db
    .from("firm_settings")
    .select("calendar_feeds_enabled")
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (settings && settings.calendar_feeds_enabled === false) {
    return { error: "Calendar feeds are disabled for your firm" as const };
  }

  const token = randomBytes(24).toString("hex"); // 48 hex chars
  const { error } = await db
    .from("users")
    .update({ calendar_feed_token: token })
    .eq("id", ctx.dbUserId);
  if (error) return { error: "Failed to enable feed" as const };

  revalidatePath("/settings");
  return { token };
}

export async function disableCalendarFeed() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" as const };
  const db = getDb();
  const { error } = await db
    .from("users")
    .update({ calendar_feed_token: null })
    .eq("id", ctx.dbUserId);
  if (error) return { error: "Failed to disable feed" as const };

  revalidatePath("/settings");
  return { success: true };
}
