import { describe, expect, it } from "vitest";
import {
  resolveNotificationPrefs,
  DEFAULT_NOTIFICATION_PREFS,
} from "@/lib/notifications/prefs";

describe("notification preference resolution (fix plan 10.4)", () => {
  it("missing/garbage input falls back to the defaults", () => {
    expect(resolveNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(resolveNotificationPrefs("junk")).toEqual(
      DEFAULT_NOTIFICATION_PREFS
    );
    expect(resolveNotificationPrefs({ message_email: "hourly" })).toEqual(
      DEFAULT_NOTIFICATION_PREFS
    );
  });

  it("honors explicit choices, sparse keys included", () => {
    expect(
      resolveNotificationPrefs({ message_email: "daily" }).message_email
    ).toBe("daily");
    expect(
      resolveNotificationPrefs({ message_email: "off", weekly_digest: false })
    ).toEqual({
      message_email: "off",
      meeting_reminders: true,
      weekly_digest: false,
    });
    expect(
      resolveNotificationPrefs({ meeting_reminders: false }).meeting_reminders
    ).toBe(false);
  });
});
