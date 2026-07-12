"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { updateNotificationPrefs } from "@/lib/actions/notifications";
import type { NotificationPrefs } from "@/lib/notifications/prefs";

/**
 * Per-user notification preferences (fix plan 10.4) — one card, mounted in
 * staff Settings and both portal dashboards.
 */
export function NotificationPrefsCard({
  prefs,
}: {
  prefs: NotificationPrefs;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateNotificationPrefs(formData);
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">Notifications</h3>
        <p className="mt-1 text-sm text-gray-500">
          How CounselWorks reaches you by email. The in-app feed (bell) always
          stays on.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Select
            name="message_email"
            label="New message emails"
            defaultValue={prefs.message_email}
            options={[
              { value: "immediate", label: "Every message" },
              { value: "daily", label: "One daily digest" },
              { value: "off", label: "Off" },
            ]}
            className="max-w-xs"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="meeting_reminders"
              defaultChecked={prefs.meeting_reminders}
              className="h-4 w-4 rounded border-gray-300"
            />
            Email me a reminder the day before meetings
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="weekly_digest"
              defaultChecked={prefs.weekly_digest}
              className="h-4 w-4 rounded border-gray-300"
            />
            Weekly progress digest email
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" loading={isPending}>
              Save preferences
            </Button>
            {saved && <span className="text-sm text-success-700">Saved</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
