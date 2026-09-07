import { describe, expect, it } from "vitest";
import {
  generateSlots,
  isValidTimeZone,
  minutesToTime,
  parseTimeToMinutes,
  zonedWallClockToUtcMs,
} from "@/lib/booking/slots";

const RULES = {
  timezone: "America/New_York",
  slot_minutes: 30,
  min_notice_hours: 24,
  max_days_ahead: 7,
};

describe("zonedWallClockToUtcMs (fix plan 13.1: counselor-zone wall-clock → UTC)", () => {
  it("converts winter (EST, UTC-5) wall-clock", () => {
    const ms = zonedWallClockToUtcMs({ year: 2026, month: 1, day: 15 }, 9 * 60, "America/New_York");
    expect(new Date(ms).toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });
  it("converts summer (EDT, UTC-4) wall-clock", () => {
    const ms = zonedWallClockToUtcMs({ year: 2026, month: 7, day: 15 }, 9 * 60, "America/New_York");
    expect(new Date(ms).toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });
  it("handles east-of-UTC zones", () => {
    const ms = zonedWallClockToUtcMs({ year: 2026, month: 3, day: 1 }, 9 * 60 + 15, "Europe/Berlin");
    expect(new Date(ms).toISOString()).toBe("2026-03-01T08:15:00.000Z");
  });
});

describe("generateSlots", () => {
  // Wednesday 2026-01-14 05:00 EST = 10:00Z, so with 24h notice every
  // Thursday-morning slot is still in the future.
  const now = Date.parse("2026-01-14T10:00:00.000Z");

  it("steps a window by slot length, in the counselor's zone, as UTC instants", () => {
    // Thursday 09:00–10:30 EST → 14:00Z, 14:30Z, 15:00Z
    const slots = generateSlots({
      windows: [{ weekday: 4, start_minute: 540, end_minute: 630 }],
      rules: RULES,
      busy: [],
      nowMs: now,
    });
    expect(slots.map((s) => s.start)).toEqual([
      "2026-01-15T14:00:00.000Z",
      "2026-01-15T14:30:00.000Z",
      "2026-01-15T15:00:00.000Z",
    ]);
    expect(slots[0].end).toBe("2026-01-15T14:30:00.000Z");
  });

  it("enforces minimum notice: same-day slots inside the notice window are dropped", () => {
    // Wednesday window 10:00–12:00 EST; now is Wed 10:00 EST (15:00Z) with
    // one hour of notice, so the 10:00 and 10:30 slots are gone.
    const slots = generateSlots({
      windows: [{ weekday: 3, start_minute: 600, end_minute: 720 }],
      rules: { ...RULES, min_notice_hours: 1 },
      busy: [],
      nowMs: Date.parse("2026-01-14T15:00:00.000Z"),
    });
    // 10:00 and 10:30 EST are within the hour; 11:00 and 11:30 remain.
    expect(slots.filter((s) => s.start.startsWith("2026-01-14")).map((s) => s.start)).toEqual([
      "2026-01-14T16:00:00.000Z",
      "2026-01-14T16:30:00.000Z",
    ]);
  });

  it("caps at max_days_ahead", () => {
    const slots = generateSlots({
      windows: [{ weekday: 3, start_minute: 600, end_minute: 660 }],
      rules: { ...RULES, max_days_ahead: 3 },
      busy: [],
      nowMs: now,
    });
    expect(slots).toEqual([]);
  });

  it("removes slots overlapping the counselor's existing meetings", () => {
    const slots = generateSlots({
      windows: [{ weekday: 4, start_minute: 540, end_minute: 660 }], // 09:00–11:00
      rules: RULES,
      busy: [
        // 09:15–09:45 EST → 14:15Z–14:45Z: kills 09:00 and 09:30 slots
        { start: "2026-01-15T14:15:00.000Z", end: "2026-01-15T14:45:00.000Z" },
        // no end → one hour from 10:30 EST kills 10:30 only
        { start: "2026-01-15T15:30:00.000Z", end: null },
      ],
      nowMs: now,
    });
    expect(slots.map((s) => s.start)).toEqual([
      "2026-01-15T15:00:00.000Z",
    ]);
  });

  it("is empty with no windows or an invalid timezone", () => {
    expect(generateSlots({ windows: [], rules: RULES, busy: [], nowMs: now })).toEqual([]);
    expect(
      generateSlots({
        windows: [{ weekday: 4, start_minute: 540, end_minute: 600 }],
        rules: { ...RULES, timezone: "Mars/Olympus" },
        busy: [],
        nowMs: now,
      })
    ).toEqual([]);
  });
});

describe("time helpers", () => {
  it("round-trips HH:MM", () => {
    expect(parseTimeToMinutes("09:30")).toBe(570);
    expect(minutesToTime(570)).toBe("09:30");
    expect(parseTimeToMinutes("24:00")).toBe(1440);
    expect(parseTimeToMinutes("9:30")).toBeNull();
    expect(parseTimeToMinutes("24:30")).toBeNull();
  });
  it("validates IANA zones", () => {
    expect(isValidTimeZone("America/Los_Angeles")).toBe(true);
    expect(isValidTimeZone("Nowhere/Land")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
