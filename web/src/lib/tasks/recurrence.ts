/**
 * Recurring task rules (fix plan 13.3) — pure calendar math, no I/O.
 *
 * Every date here is a plain `YYYY-MM-DD` calendar date in the FIRM's
 * timezone (`firms.timezone`). The materializer converts "today" into that
 * zone before asking what is due, and converts an occurrence date back into
 * a UTC instant for `tasks.due_at`.
 */
import { zonedDate, zonedWallClockToUtcMs } from "@/lib/booking/slots";
import type { TaskCadence } from "@/lib/constants/tasks";
import { WEEKDAY_LABELS } from "@/lib/constants/meetings";

export interface RecurrenceRule {
  cadence: TaskCadence;
  /** Weekly: 0 = Sunday … 6 = Saturday. */
  weekday: number | null;
  /** Monthly: 1–28 so every month has the day. */
  day_of_month: number | null;
}

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

/**
 * Never materialize more than this many days of missed occurrences in one
 * pass (re-activating a template paused for a year must not flood the
 * assignee with 52 stale tasks). Older occurrences are skipped for good —
 * `last_materialized_on` moves past them.
 */
export const CATCH_UP_WINDOW_DAYS = 56;

/**
 * Generated tasks are due at 09:00 firm-local on the occurrence date. This
 * is a deliberate default (the template has no time-of-day control): the
 * task lands at the start of the working day rather than at midnight.
 */
export const OCCURRENCE_DUE_MINUTE_OF_DAY = 9 * 60;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(iso: string): CalendarDate {
  if (!ISO_DATE_RE.test(iso)) throw new Error(`Invalid ISO date: ${iso}`);
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function formatIsoDate(date: CalendarDate): string {
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return `${date.year}-${mm}-${dd}`;
}

export function addDays(date: CalendarDate, n: number): CalendarDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function weekdayOf(date: CalendarDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/** Days from `a` to `b` (positive when b is later). */
export function daysBetween(a: CalendarDate, b: CalendarDate): number {
  const ms =
    Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function ruleMatches(rule: RecurrenceRule, date: CalendarDate): boolean {
  if (rule.cadence === "weekly") {
    return rule.weekday !== null && weekdayOf(date) === rule.weekday;
  }
  return rule.day_of_month !== null && date.day === rule.day_of_month;
}

/**
 * Every occurrence date that is due as of `through` (inclusive) and has not
 * been materialized yet: from the day after `lastMaterializedOn` (or from
 * `startsOn` when nothing has been materialized), capped to the catch-up
 * window. Ascending `YYYY-MM-DD`.
 */
export function occurrencesDue(
  rule: RecurrenceRule,
  input: {
    startsOn: string;
    lastMaterializedOn: string | null;
    /** Firm-local "today". */
    through: string;
  }
): string[] {
  const through = parseIsoDate(input.through);
  let from = parseIsoDate(input.startsOn);
  if (input.lastMaterializedOn) {
    const resume = addDays(parseIsoDate(input.lastMaterializedOn), 1);
    if (daysBetween(from, resume) > 0) from = resume;
  }
  const windowStart = addDays(through, -(CATCH_UP_WINDOW_DAYS - 1));
  if (daysBetween(from, windowStart) > 0) from = windowStart;

  const out: string[] = [];
  const span = daysBetween(from, through);
  for (let i = 0; i <= span; i++) {
    const d = addDays(from, i);
    if (ruleMatches(rule, d)) out.push(formatIsoDate(d));
  }
  return out;
}

/** First occurrence strictly after `after` (or on/after `startsOn` if later). */
export function nextOccurrenceOn(
  rule: RecurrenceRule,
  input: { startsOn: string; after: string }
): string {
  let d = addDays(parseIsoDate(input.after), 1);
  const starts = parseIsoDate(input.startsOn);
  if (daysBetween(d, starts) > 0) d = starts;
  // A weekly rule recurs within 7 days, a monthly one within 31.
  for (let i = 0; i < 62; i++) {
    if (ruleMatches(rule, d)) return formatIsoDate(d);
    d = addDays(d, 1);
  }
  throw new Error("Recurrence rule never matches");
}

/** Firm-local calendar date for a UTC instant. */
export function firmTodayIso(nowMs: number, timezone: string): string {
  return formatIsoDate(zonedDate(nowMs, timezone));
}

/** `tasks.due_at` for an occurrence: 09:00 firm-local on that date, as ISO. */
export function occurrenceDueAtIso(occurrenceOn: string, timezone: string): string {
  const ms = zonedWallClockToUtcMs(
    parseIsoDate(occurrenceOn),
    OCCURRENCE_DUE_MINUTE_OF_DAY,
    timezone
  );
  return new Date(ms).toISOString();
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "Weekly on Monday" / "Monthly on the 15th" — one label map for every surface. */
export function describeRecurrence(rule: RecurrenceRule): string {
  if (rule.cadence === "weekly") {
    const name = rule.weekday === null ? "?" : WEEKDAY_LABELS[rule.weekday];
    return `Weekly on ${name}`;
  }
  return `Monthly on the ${ordinal(rule.day_of_month ?? 1)}`;
}
