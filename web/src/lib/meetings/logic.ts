/**
 * Pure meeting logic, shared by the calendar UI and the meeting server
 * actions and locked by tests/unit/meetings.test.ts.
 *
 * Fix plan 7.2: meeting times used to be parsed with `new Date(date + "T" +
 * time)` on the server, so the stored instant depended on the *server's*
 * timezone — a counselor entering 2:00 PM saw a different hour after render.
 * The browser now submits the UTC offset for the chosen wall-clock moment
 * (DST-correct via Date.getTimezoneOffset() on that date) and the server
 * does pure arithmetic; it never interprets a wall-clock string locally.
 *
 * Fix plan 7.3: edits used to delete and re-insert every non-creator
 * attendee as `pending`, wiping RSVP state. Edits now diff the attendee list
 * and only touch actual additions/removals.
 */

export interface ParsedSchedule {
  scheduledStart: string | null;
  scheduledEnd: string | null;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function wallClockToUtcIso(
  date: string,
  time: string,
  tzOffsetMinutes: number
): string | null {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) return null;
  // Date.getTimezoneOffset() convention: UTC = local wall-clock + offset.
  const utcMs =
    Date.UTC(
      Number(d[1]),
      Number(d[2]) - 1,
      Number(d[3]),
      Number(t[1]),
      Number(t[2]),
      t[3] ? Number(t[3]) : 0
    ) +
    tzOffsetMinutes * 60_000;
  return new Date(utcMs).toISOString();
}

/**
 * Convert a submitted wall-clock schedule (start date + times) and the
 * browser's UTC offset for that moment into UTC ISO timestamps.
 */
export function buildScheduleIso(input: {
  startDate: string | null;
  startTime: string | null;
  endTime?: string | null;
  tzOffsetMinutes: number;
}): ParsedSchedule {
  if (!input.startDate || !input.startTime) {
    return { scheduledStart: null, scheduledEnd: null };
  }
  const scheduledStart = wallClockToUtcIso(
    input.startDate,
    input.startTime,
    input.tzOffsetMinutes
  );
  const scheduledEnd =
    scheduledStart && input.endTime
      ? wallClockToUtcIso(input.startDate, input.endTime, input.tzOffsetMinutes)
      : null;
  return { scheduledStart, scheduledEnd };
}

/**
 * The browser-side companion of buildScheduleIso: the UTC offset (minutes)
 * of this environment for the given local wall-clock moment. Evaluated on
 * the chosen date so DST transitions resolve correctly.
 */
export function localTzOffsetMinutes(
  startDate: string,
  startTime: string
): number {
  const local = new Date(`${startDate}T${startTime}`);
  return Number.isNaN(local.getTime())
    ? new Date().getTimezoneOffset()
    : local.getTimezoneOffset();
}

/**
 * Diff an attendee list edit. Unchanged attendees are left alone so their
 * RSVP (attendance_status) survives the edit.
 */
export function diffAttendees(
  existingIds: string[],
  nextIds: string[]
): { toAdd: string[]; toRemove: string[] } {
  const existing = new Set(existingIds);
  const next = new Set(nextIds);
  return {
    toAdd: [...next].filter((id) => !existing.has(id)),
    toRemove: [...existing].filter((id) => !next.has(id)),
  };
}

/**
 * Explicit audience decision: meetings with a parent attendee are
 * family-visible, with a student attendee student-visible, staff-only
 * otherwise. The calendar modals surface the same derivation before save so
 * a visibility flip is never silent.
 */
export function deriveMeetingVisibility(
  attendeeRoles: Iterable<string>
): string {
  const roles = Array.from(attendeeRoles);
  if (roles.includes("parent_guardian")) return "family";
  if (roles.includes("student")) return "student";
  return "staff";
}
