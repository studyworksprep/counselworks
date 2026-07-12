/**
 * Minimal RFC 5545 (iCalendar) generation for the read-only counselor feed
 * (fix plan 10.7). Pure functions — unit-tested without a database.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  /** ISO timestamps (UTC). Events without a start are skipped. */
  start: string | null;
  end: string | null;
  location?: string | null;
  description?: string | null;
}

/** Escape per RFC 5545 §3.3.11: backslash, semicolon, comma, newline. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** 2026-07-12T15:30:00.000Z → 20260712T153000Z */
export function toIcsUtc(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1) with a space continuation. */
export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length > 0) parts.push(" " + rest);
  return parts.join("\r\n");
}

export function buildIcsCalendar(options: {
  calendarName: string;
  events: IcsEvent[];
  /** Stamp for DTSTAMP; defaults to now. Injectable for tests. */
  now?: Date;
}): string {
  const stamp = toIcsUtc((options.now ?? new Date()).toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CounselWorks//Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
  ];

  for (const event of options.events) {
    if (!event.start) continue;
    const dtStart = toIcsUtc(event.start);
    if (!dtStart) continue;
    // Default duration: one hour when no end is recorded.
    const dtEnd = event.end
      ? toIcsUtc(event.end)
      : toIcsUtc(
          new Date(new Date(event.start).getTime() + 3_600_000).toISOString()
        );

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(event.uid)}@counselworks`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${dtStart}`);
    if (dtEnd) lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.location) {
      lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    }
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
