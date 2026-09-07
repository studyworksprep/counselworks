"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { updateBookingSettings } from "@/lib/actions/booking";
import type { BookingSettingsRow, BookingWindowRow } from "@/lib/db/queries";
import { minutesToTime } from "@/lib/booking/slots";
import { BOOKING_SLOT_MINUTES, WEEKDAY_LABELS } from "@/lib/constants/meetings";

const FALLBACK_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "UTC",
];

const DEFAULT_WINDOW = { start: "09:00", end: "17:00" };

/**
 * Settings → Booking availability (fix plan 13.1). Every staff member
 * publishes their own weekly windows and booking rules; families of the
 * students assigned to them then self-book from the portal. The form
 * initialises every field from current values (rule 6) and the action
 * replaces all windows, so unchecking a day removes it — nothing is
 * silently kept or dropped.
 */
export function BookingAvailabilityCard({
  settings,
  windows,
}: {
  settings: BookingSettingsRow | null;
  windows: BookingWindowRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);

  const browserZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  }, []);
  const zones = useMemo(() => {
    let list: string[] = FALLBACK_ZONES;
    try {
      const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
        .supportedValuesOf?.("timeZone");
      if (supported && supported.length > 0) list = supported;
    } catch {
      /* fall back */
    }
    const current = settings?.timezone ?? browserZone;
    return list.includes(current) ? list : [current, ...list];
  }, [settings?.timezone, browserZone]);

  const byWeekday = new Map(windows.map((w) => [w.weekday, w]));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateBookingSettings(formData);
      if (result.error) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">Booking Availability</h3>
        <p className="mt-1 text-sm text-gray-500">
          Let the families of your assigned students book time with you from
          their portal. Slots come from the weekly hours below minus your
          existing meetings, and each booking lands on your calendar as a
          family-visible meeting.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              name="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Families can book meetings with me
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="booking-timezone" className="mb-1 block text-xs font-medium text-gray-500">
                Your timezone
              </label>
              <select
                id="booking-timezone"
                name="timezone"
                defaultValue={settings?.timezone ?? browserZone}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="booking-slot" className="mb-1 block text-xs font-medium text-gray-500">
                Meeting length
              </label>
              <select
                id="booking-slot"
                name="slot_minutes"
                defaultValue={settings?.slot_minutes ?? 30}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {BOOKING_SLOT_MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="booking-notice" className="mb-1 block text-xs font-medium text-gray-500">
                Minimum notice (hours)
              </label>
              <input
                id="booking-notice"
                type="number"
                name="min_notice_hours"
                min={0}
                max={336}
                defaultValue={settings?.min_notice_hours ?? 24}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="booking-horizon" className="mb-1 block text-xs font-medium text-gray-500">
                Bookable up to (days ahead)
              </label>
              <input
                id="booking-horizon"
                type="number"
                name="max_days_ahead"
                min={1}
                max={120}
                defaultValue={settings?.max_days_ahead ?? 30}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="booking-location" className="mb-1 block text-xs font-medium text-gray-500">
                Location or video link (added to every booked meeting)
              </label>
              <input
                id="booking-location"
                type="text"
                name="location_text"
                defaultValue={settings?.location_text ?? ""}
                placeholder="e.g. Zoom link or office address"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-medium text-gray-500">Weekly hours</legend>
            <div className="space-y-2">
              {WEEKDAY_LABELS.map((label, d) => (
                <WeekdayRow key={d} weekday={d} label={label} window={byWeekday.get(d) ?? null} />
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" loading={isPending}>
              Save Availability
            </Button>
            {saved && <span className="text-sm text-success-700">Saved</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function WeekdayRow({
  weekday,
  label,
  window,
}: {
  weekday: number;
  label: string;
  window: BookingWindowRow | null;
}) {
  const [on, setOn] = useState(window !== null);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex w-32 items-center gap-2 text-gray-700">
        <input
          type="checkbox"
          name={`weekday_${weekday}_enabled`}
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        {label}
      </label>
      <input
        type="time"
        name={`weekday_${weekday}_start`}
        aria-label={`${label} start`}
        defaultValue={window ? minutesToTime(window.start_minute) : DEFAULT_WINDOW.start}
        disabled={!on}
        className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-400"
      />
      <span className="text-gray-400">to</span>
      <input
        type="time"
        name={`weekday_${weekday}_end`}
        aria-label={`${label} end`}
        defaultValue={window ? minutesToTime(window.end_minute) : DEFAULT_WINDOW.end}
        disabled={!on}
        className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-400"
      />
    </div>
  );
}
