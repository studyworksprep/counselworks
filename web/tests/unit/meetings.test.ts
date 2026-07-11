import { describe, expect, it } from "vitest";
import {
  buildScheduleIso,
  diffAttendees,
  deriveMeetingVisibility,
} from "@/lib/meetings/logic";

describe("buildScheduleIso (fix plan 7.2: no server-timezone guessing)", () => {
  it("converts a US Pacific wall-clock (winter, UTC-8 → offset 480) to UTC", () => {
    const { scheduledStart, scheduledEnd } = buildScheduleIso({
      startDate: "2026-01-15",
      startTime: "14:00",
      endTime: "15:30",
      tzOffsetMinutes: 480,
    });
    expect(scheduledStart).toBe("2026-01-15T22:00:00.000Z");
    expect(scheduledEnd).toBe("2026-01-15T23:30:00.000Z");
  });

  it("uses the offset for the chosen date, so DST is the caller's problem, solved once", () => {
    // Same wall-clock in US Pacific summer (UTC-7 → offset 420).
    const { scheduledStart } = buildScheduleIso({
      startDate: "2026-07-15",
      startTime: "14:00",
      tzOffsetMinutes: 420,
    });
    expect(scheduledStart).toBe("2026-07-15T21:00:00.000Z");
  });

  it("handles east-of-UTC offsets (negative per getTimezoneOffset convention)", () => {
    const { scheduledStart } = buildScheduleIso({
      startDate: "2026-03-01",
      startTime: "09:15",
      tzOffsetMinutes: -120, // UTC+2
    });
    expect(scheduledStart).toBe("2026-03-01T07:15:00.000Z");
  });

  it("offset 0 means the wall-clock IS UTC — the deterministic fallback", () => {
    const { scheduledStart } = buildScheduleIso({
      startDate: "2026-05-02",
      startTime: "10:00",
      tzOffsetMinutes: 0,
    });
    expect(scheduledStart).toBe("2026-05-02T10:00:00.000Z");
  });

  it("returns nulls without a start; end time alone never produces an end", () => {
    expect(
      buildScheduleIso({ startDate: null, startTime: "10:00", tzOffsetMinutes: 0 })
    ).toEqual({ scheduledStart: null, scheduledEnd: null });
    expect(
      buildScheduleIso({ startDate: "2026-05-02", startTime: null, endTime: "11:00", tzOffsetMinutes: 0 })
    ).toEqual({ scheduledStart: null, scheduledEnd: null });
  });

  it("rejects malformed inputs instead of inventing dates", () => {
    expect(
      buildScheduleIso({
        startDate: "05/02/2026",
        startTime: "10:00",
        tzOffsetMinutes: 0,
      }).scheduledStart
    ).toBeNull();
    expect(
      buildScheduleIso({
        startDate: "2026-05-02",
        startTime: "10am",
        tzOffsetMinutes: 0,
      }).scheduledStart
    ).toBeNull();
  });
});

describe("diffAttendees (fix plan 7.3: edits keep RSVP state)", () => {
  it("leaves unchanged attendees untouched", () => {
    const { toAdd, toRemove } = diffAttendees(["a", "b"], ["a", "b"]);
    expect(toAdd).toEqual([]);
    expect(toRemove).toEqual([]);
  });

  it("adds only new attendees and removes only dropped ones", () => {
    const { toAdd, toRemove } = diffAttendees(["a", "b"], ["b", "c"]);
    expect(toAdd).toEqual(["c"]);
    expect(toRemove).toEqual(["a"]);
  });

  it("handles empty sides", () => {
    expect(diffAttendees([], ["x"])).toEqual({ toAdd: ["x"], toRemove: [] });
    expect(diffAttendees(["x"], [])).toEqual({ toAdd: [], toRemove: ["x"] });
  });
});

describe("deriveMeetingVisibility (explicit audience decision)", () => {
  it("a parent attendee makes the meeting family-visible", () => {
    expect(deriveMeetingVisibility(["counselor", "parent_guardian"])).toBe(
      "family"
    );
    expect(
      deriveMeetingVisibility(["student", "parent_guardian"])
    ).toBe("family");
  });

  it("a student attendee (no parent) makes it student-visible", () => {
    expect(deriveMeetingVisibility(["counselor", "student"])).toBe("student");
  });

  it("staff-only attendees keep it staff-only", () => {
    expect(deriveMeetingVisibility(["counselor", "firm_owner"])).toBe("staff");
    expect(deriveMeetingVisibility([])).toBe("staff");
  });
});
