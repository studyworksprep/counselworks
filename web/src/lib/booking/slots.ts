/**
 * Pure self-booking logic (fix plan 13.1), shared by the portal booking page
 * (to list slots) and the bookMeeting action (to re-verify the chosen slot
 * server-side), and locked by tests/unit/booking.test.ts.
 *
 * Availability windows are wall-clock ranges in the counselor's IANA
 * timezone; slots are emitted as UTC instants so the parent's browser can
 * render them in *its* zone (the 7.2 rule: the server never interprets a
 * wall-clock string in its own local timezone). Zone math uses Intl only —
 * no extra dependency.
 */

export interface AvailabilityWindow {
  weekday: number; // 0 = Sunday … 6 = Saturday, in the counselor's zone
  start_minute: number; // minutes from local midnight
  end_minute: number;
}

export interface BookingRules {
  timezone: string;
  slot_minutes: number;
  min_notice_hours: number;
  max_days_ahead: number;
}

export interface BusyInterval {
  start: string; // ISO
  end: string | null; // ISO; null = unknown end → treated as one hour
}

export interface Slot {
  start: string; // ISO UTC
  end: string; // ISO UTC
}

const MINUTE = 60_000;
const DAY = 86_400_000;
const DEFAULT_BUSY_MINUTES = 60;

export function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(utcMs: number, tz: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset (minutes) such that local wall-clock = UTC + offset, at `utcMs`. */
function zoneOffsetMinutes(utcMs: number, tz: string): number {
  const p = zonedParts(utcMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - utcMs) / MINUTE);
}

/**
 * The UTC instant of a wall-clock moment (calendar date + minutes from
 * midnight) in `tz`. Two-pass so DST transitions on that date resolve.
 */
export function zonedWallClockToUtcMs(
  date: { year: number; month: number; day: number },
  minuteOfDay: number,
  tz: string
): number {
  const guess = Date.UTC(date.year, date.month - 1, date.day, 0, minuteOfDay);
  const off1 = zoneOffsetMinutes(guess, tz);
  let utc = guess - off1 * MINUTE;
  const off2 = zoneOffsetMinutes(utc, tz);
  if (off2 !== off1) utc = guess - off2 * MINUTE;
  return utc;
}

/** Calendar date in `tz` for a UTC instant. */
export function zonedDate(utcMs: number, tz: string) {
  const p = zonedParts(utcMs, tz);
  return { year: p.year, month: p.month, day: p.day };
}

function addDays(date: { year: number; month: number; day: number }, n: number) {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function weekdayOf(date: { year: number; month: number; day: number }): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/**
 * Every open slot between now + min notice and now + max days ahead:
 * windows stepped by slot length, minus anything overlapping the
 * counselor's existing meetings. Sorted ascending.
 */
export function generateSlots(input: {
  windows: AvailabilityWindow[];
  rules: BookingRules;
  busy: BusyInterval[];
  nowMs: number;
}): Slot[] {
  const { windows, rules, busy, nowMs } = input;
  if (!isValidTimeZone(rules.timezone) || rules.slot_minutes <= 0) return [];
  const slotMs = rules.slot_minutes * MINUTE;
  const earliest = nowMs + rules.min_notice_hours * 60 * MINUTE;
  const latest = nowMs + rules.max_days_ahead * DAY;

  const busyRanges = busy
    .map((b) => {
      const start = Date.parse(b.start);
      const end = b.end ? Date.parse(b.end) : start + DEFAULT_BUSY_MINUTES * MINUTE;
      return Number.isFinite(start) ? { start, end } : null;
    })
    .filter((b): b is { start: number; end: number } => b !== null);

  const byWeekday = new Map<number, AvailabilityWindow[]>();
  for (const w of windows) {
    if (w.end_minute <= w.start_minute) continue;
    const list = byWeekday.get(w.weekday) ?? [];
    list.push(w);
    byWeekday.set(w.weekday, list);
  }
  if (byWeekday.size === 0) return [];

  const slots: Slot[] = [];
  const today = zonedDate(nowMs, rules.timezone);
  for (let i = 0; i <= rules.max_days_ahead; i++) {
    const date = addDays(today, i);
    const dayWindows = byWeekday.get(weekdayOf(date));
    if (!dayWindows) continue;
    for (const w of dayWindows) {
      for (let m = w.start_minute; m + rules.slot_minutes <= w.end_minute; m += rules.slot_minutes) {
        const start = zonedWallClockToUtcMs(date, m, rules.timezone);
        const end = start + slotMs;
        if (start < earliest || start > latest) continue;
        if (busyRanges.some((b) => b.start < end && b.end > start)) continue;
        slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      }
    }
  }
  slots.sort((a, b) => a.start.localeCompare(b.start));
  return slots;
}

/** "09:00" → 540; null when malformed. */
export function parseTimeToMinutes(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** 540 → "09:00" (1440 → "24:00"). */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
