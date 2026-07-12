import { describe, it, expect } from "vitest";
import {
  buildIcsCalendar,
  escapeIcsText,
  toIcsUtc,
  foldIcsLine,
} from "@/lib/calendar/ics";

describe("escapeIcsText", () => {
  it("escapes RFC 5545 special characters", () => {
    expect(escapeIcsText("a;b,c\\d")).toBe("a\\;b\\,c\\\\d");
    expect(escapeIcsText("line1\nline2")).toBe("line1\\nline2");
    expect(escapeIcsText("line1\r\nline2")).toBe("line1\\nline2");
  });
});

describe("toIcsUtc", () => {
  it("formats ISO timestamps as UTC basic format", () => {
    expect(toIcsUtc("2026-07-12T15:30:00.000Z")).toBe("20260712T153000Z");
  });
  it("returns null for junk", () => {
    expect(toIcsUtc("not-a-date")).toBeNull();
  });
});

describe("foldIcsLine", () => {
  it("leaves short lines alone", () => {
    expect(foldIcsLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });
  it("folds long lines with space continuations", () => {
    const folded = foldIcsLine(`SUMMARY:${"x".repeat(200)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].length).toBe(75);
    for (const cont of lines.slice(1)) {
      expect(cont.startsWith(" ")).toBe(true);
      expect(cont.length).toBeLessThanOrEqual(75);
    }
    // Unfolding reproduces the original.
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"x".repeat(200)}`);
  });
});

describe("buildIcsCalendar", () => {
  const now = new Date("2026-07-12T00:00:00Z");

  it("emits a valid skeleton with one event", () => {
    const ics = buildIcsCalendar({
      calendarName: "CounselWorks — Amy Counselor",
      now,
      events: [
        {
          uid: "meet-1",
          title: "Strategy session; Smith, family",
          start: "2026-09-01T17:00:00Z",
          end: "2026-09-01T18:00:00Z",
          location: "Zoom",
          description: "Student: Jordan Smith",
        },
      ],
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("UID:meet-1@counselworks");
    expect(ics).toContain("DTSTART:20260901T170000Z");
    expect(ics).toContain("DTEND:20260901T180000Z");
    expect(ics).toContain("SUMMARY:Strategy session\\; Smith\\, family");
    expect(ics).toContain("LOCATION:Zoom");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("defaults a missing end to one hour after start", () => {
    const ics = buildIcsCalendar({
      calendarName: "Test",
      now,
      events: [
        { uid: "m2", title: "Check-in", start: "2026-09-01T17:00:00Z", end: null },
      ],
    });
    expect(ics).toContain("DTEND:20260901T180000Z");
  });

  it("skips events without a start", () => {
    const ics = buildIcsCalendar({
      calendarName: "Test",
      now,
      events: [{ uid: "m3", title: "Unscheduled", start: null, end: null }],
    });
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
