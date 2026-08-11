"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  rotateCalendarFeedToken,
  disableCalendarFeed,
} from "@/lib/actions/calendar-feed";
import { updateCalendarFeedsEnabled } from "@/lib/actions/settings";

/**
 * Personal ICS feed management (fix plan 10.7) — mounted in Settings for
 * every staff member. Subscribe-only: external apps read, never write.
 * Admins also get the firm-wide kill switch (fix plan 11.5).
 */
export function CalendarFeedCard({
  token,
  feedsEnabled = true,
  isAdmin = false,
}: {
  token: string | null;
  feedsEnabled?: boolean;
  isAdmin?: boolean;
}) {
  const [current, setCurrent] = useState(token);
  const [firmEnabled, setFirmEnabled] = useState(feedsEnabled);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggleFirm(enabled: boolean) {
    setError(null);
    setFirmEnabled(enabled);
    startTransition(async () => {
      const result = await updateCalendarFeedsEnabled(enabled);
      if ("error" in result && result.error) {
        setError(result.error);
        setFirmEnabled(!enabled); // revert on failure
      }
    });
  }

  const feedUrl = current
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar-feed/${current}`
    : null;

  function handleRotate() {
    setError(null);
    startTransition(async () => {
      const result = await rotateCalendarFeedToken();
      if ("error" in result && result.error) setError(result.error);
      else if ("token" in result) setCurrent(result.token);
    });
  }

  function handleDisable() {
    setError(null);
    startTransition(async () => {
      const result = await disableCalendarFeed();
      if ("error" in result && result.error) setError(result.error);
      else setCurrent(null);
    });
  }

  async function handleCopy() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">Calendar Feed</h3>
        <p className="mt-1 text-sm text-gray-500">
          Subscribe from Google Calendar, Apple Calendar, or Outlook to see
          your CounselWorks meetings alongside your other events. Read-only.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {error && <Alert>{error}</Alert>}

          {isAdmin && (
            <label className="flex items-center gap-2 border-b border-gray-100 pb-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={firmEnabled}
                onChange={(e) => toggleFirm(e.target.checked)}
                disabled={isPending}
                className="h-4 w-4 rounded border-gray-300"
              />
              Allow staff to publish calendar feeds (firm-wide)
            </label>
          )}

          {!firmEnabled ? (
            <p className="py-2 text-sm text-gray-500">
              Calendar feeds are turned off for your firm
              {isAdmin ? " — enable the setting above to publish yours." : "."}
            </p>
          ) : current ? (
            <>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  {feedUrl}
                </code>
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Anyone with this link can read your meeting schedule. Rotate
                it if it leaks; existing subscriptions will stop updating.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRotate}
                  loading={isPending}
                >
                  Rotate Link
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDisable}
                  disabled={isPending}
                >
                  Disable Feed
                </Button>
              </div>
            </>
          ) : (
            <Button size="sm" onClick={handleRotate} loading={isPending}>
              Enable Calendar Feed
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
