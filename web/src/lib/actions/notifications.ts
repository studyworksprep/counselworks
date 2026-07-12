"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  resolveNotificationPrefs,
  type NotificationPrefs,
} from "../notifications/prefs";

/**
 * In-app notification feed + per-user preferences (fix plan 10.4).
 */

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

/** The bell's data source — the caller's own feed, newest first. */
export async function getMyNotifications(): Promise<{
  notifications: NotificationRow[];
  unread: number;
}> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { notifications: [], unread: 0 };
  const db = getDb();
  const { data } = await db
    .from("notifications")
    .select("id, kind, title, body, href, read_at, created_at")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId)
    .order("created_at", { ascending: false })
    .limit(15);
  const notifications = data ?? [];
  return {
    notifications,
    unread: notifications.filter((n) => !n.read_at).length,
  };
}

export async function markAllNotificationsRead() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId)
    .is("read_at", null);
  return { success: true };
}

export async function getMyNotificationPrefs(): Promise<NotificationPrefs> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return resolveNotificationPrefs(null);
  const db = getDb();
  const { data } = await db
    .from("users")
    .select("notification_preferences_json")
    .eq("id", ctx.dbUserId)
    .maybeSingle();
  return resolveNotificationPrefs(data?.notification_preferences_json);
}

export async function updateNotificationPrefs(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const prefs = resolveNotificationPrefs({
    message_email: formData.get("message_email"),
    meeting_reminders: formData.get("meeting_reminders") === "on",
    weekly_digest: formData.get("weekly_digest") === "on",
  });

  const db = getDb();
  const { error } = await db
    .from("users")
    .update({ notification_preferences_json: prefs })
    .eq("id", ctx.dbUserId);
  if (error) return { error: "Failed to save preferences" };

  revalidatePath("/settings");
  revalidatePath("/student-dashboard");
  revalidatePath("/family-dashboard");
  return { success: true };
}
