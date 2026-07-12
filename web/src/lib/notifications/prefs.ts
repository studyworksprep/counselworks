/**
 * Notification preference resolution (fix plan 10.4) — pure, unit-tested.
 * Stored sparse in users.notification_preferences_json; unknown or missing
 * keys fall back to these defaults.
 */

export interface NotificationPrefs {
  /** New-message emails: every message, one daily digest, or none. */
  message_email: "immediate" | "daily" | "off";
  /** 24-hours-before meeting reminder emails. */
  meeting_reminders: boolean;
  /** Weekly progress digest (parents). */
  weekly_digest: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  message_email: "immediate",
  meeting_reminders: true,
  weekly_digest: true,
};

export function resolveNotificationPrefs(value: unknown): NotificationPrefs {
  const raw = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const messageEmail = raw.message_email;
  return {
    message_email:
      messageEmail === "daily" || messageEmail === "off"
        ? messageEmail
        : "immediate",
    meeting_reminders:
      typeof raw.meeting_reminders === "boolean"
        ? raw.meeting_reminders
        : DEFAULT_NOTIFICATION_PREFS.meeting_reminders,
    weekly_digest:
      typeof raw.weekly_digest === "boolean"
        ? raw.weekly_digest
        : DEFAULT_NOTIFICATION_PREFS.weekly_digest,
  };
}
