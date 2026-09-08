import { describe, expect, it } from "vitest";
import {
  CATCH_UP_WINDOW_DAYS,
  describeRecurrence,
  firmTodayIso,
  nextOccurrenceOn,
  occurrenceDueAtIso,
  occurrencesDue,
} from "@/lib/tasks/recurrence";

// 2026-09-07 is a Monday.
const weeklyMonday = { cadence: "weekly" as const, weekday: 1, day_of_month: null };
const monthly15 = { cadence: "monthly" as const, weekday: null, day_of_month: 15 };

describe("occurrencesDue (fix plan 13.3: recurring task rules)", () => {
  it("weekly: every matching weekday from starts_on through today", () => {
    expect(
      occurrencesDue(weeklyMonday, {
        startsOn: "2026-09-01",
        lastMaterializedOn: null,
        through: "2026-09-21",
      })
    ).toEqual(["2026-09-07", "2026-09-14", "2026-09-21"]);
  });

  it("weekly: starts_on itself counts when it matches", () => {
    expect(
      occurrencesDue(weeklyMonday, {
        startsOn: "2026-09-07",
        lastMaterializedOn: null,
        through: "2026-09-07",
      })
    ).toEqual(["2026-09-07"]);
  });

  it("monthly: that day of each month, never before starts_on", () => {
    expect(
      occurrencesDue(monthly15, {
        startsOn: "2026-08-20",
        lastMaterializedOn: null,
        through: "2026-09-30",
      })
    ).toEqual(["2026-09-15"]);
  });

  it("resumes the day after last_materialized_on (idempotent second run)", () => {
    const first = occurrencesDue(weeklyMonday, {
      startsOn: "2026-09-01",
      lastMaterializedOn: null,
      through: "2026-09-14",
    });
    expect(first).toEqual(["2026-09-07", "2026-09-14"]);
    const second = occurrencesDue(weeklyMonday, {
      startsOn: "2026-09-01",
      lastMaterializedOn: "2026-09-14",
      through: "2026-09-14",
    });
    expect(second).toEqual([]);
  });

  it("nothing is due before starts_on", () => {
    expect(
      occurrencesDue(weeklyMonday, {
        startsOn: "2026-10-01",
        lastMaterializedOn: null,
        through: "2026-09-21",
      })
    ).toEqual([]);
  });

  it("caps catch-up after a long pause to the window", () => {
    const due = occurrencesDue(weeklyMonday, {
      startsOn: "2025-01-06",
      lastMaterializedOn: "2025-03-03",
      through: "2026-09-14",
    });
    expect(due.length).toBe(CATCH_UP_WINDOW_DAYS / 7);
    expect(due[due.length - 1]).toBe("2026-09-14");
    expect(due[0]).toBe("2026-07-27");
  });
});

describe("nextOccurrenceOn", () => {
  it("weekly: the next matching weekday strictly after the date", () => {
    expect(nextOccurrenceOn(weeklyMonday, { startsOn: "2026-09-01", after: "2026-09-07" }))
      .toBe("2026-09-14");
  });
  it("monthly: rolls into the next month", () => {
    expect(nextOccurrenceOn(monthly15, { startsOn: "2026-09-01", after: "2026-09-15" }))
      .toBe("2026-10-15");
  });
  it("never earlier than starts_on", () => {
    expect(nextOccurrenceOn(weeklyMonday, { startsOn: "2026-10-01", after: "2026-09-07" }))
      .toBe("2026-10-05");
  });
});

describe("firm-timezone boundaries", () => {
  it("firmTodayIso uses the firm's calendar day, not UTC's", () => {
    // 03:30 UTC on Sep 8 is still Sep 7 in New York.
    const nowMs = Date.UTC(2026, 8, 8, 3, 30);
    expect(firmTodayIso(nowMs, "America/New_York")).toBe("2026-09-07");
    expect(firmTodayIso(nowMs, "UTC")).toBe("2026-09-08");
  });
  it("occurrenceDueAtIso is 09:00 firm-local", () => {
    expect(occurrenceDueAtIso("2026-09-07", "America/New_York"))
      .toBe("2026-09-07T13:00:00.000Z");
    expect(occurrenceDueAtIso("2026-01-05", "America/New_York"))
      .toBe("2026-01-05T14:00:00.000Z");
  });
});

describe("describeRecurrence", () => {
  it("labels weekly and monthly rules", () => {
    expect(describeRecurrence(weeklyMonday)).toBe("Weekly on Monday");
    expect(describeRecurrence(monthly15)).toBe("Monthly on the 15th");
    expect(describeRecurrence({ ...monthly15, day_of_month: 1 })).toBe("Monthly on the 1st");
    expect(describeRecurrence({ ...monthly15, day_of_month: 22 })).toBe("Monthly on the 22nd");
    expect(describeRecurrence({ ...monthly15, day_of_month: 3 })).toBe("Monthly on the 3rd");
  });
});
