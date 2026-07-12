import { describe, it, expect } from "vitest";
import {
  parseEngagementLog,
  ENGAGEMENT_TYPES,
  ENGAGEMENT_TYPE_LABELS,
  INTERVIEW_STATUSES,
  INTERVIEW_STATUS_LABELS,
} from "@/lib/constants/engagement";

describe("engagement constants (CLAUDE.md rule 4)", () => {
  it("every type and status has a label", () => {
    for (const t of ENGAGEMENT_TYPES) {
      expect(ENGAGEMENT_TYPE_LABELS[t.value]).toBeTruthy();
    }
    for (const s of INTERVIEW_STATUSES) {
      expect(INTERVIEW_STATUS_LABELS[s.value]).toBeTruthy();
    }
  });
});

describe("parseEngagementLog", () => {
  it("passes through well-formed entries", () => {
    const log = parseEngagementLog([
      { type: "campus_visit", date: "2026-04-12", note: "Toured with mom" },
    ]);
    expect(log).toEqual([
      { type: "campus_visit", date: "2026-04-12", note: "Toured with mom" },
    ]);
  });

  it("returns [] for junk containers", () => {
    expect(parseEngagementLog(null)).toEqual([]);
    expect(parseEngagementLog("visits")).toEqual([]);
    expect(parseEngagementLog({ type: "campus_visit" })).toEqual([]);
  });

  it("coerces unknown types to other and drops junk fields", () => {
    const log = parseEngagementLog([
      { type: "carrier_pigeon", date: "not-a-date", note: "   " },
      null,
      "string entry",
    ]);
    expect(log).toEqual([{ type: "other", date: null, note: null }]);
  });

  it("truncates oversized notes and caps entry count", () => {
    const log = parseEngagementLog([
      { type: "interview", date: null, note: "x".repeat(600) },
    ]);
    expect(log[0].note!.length).toBe(500);

    const many = parseEngagementLog(
      Array.from({ length: 150 }, () => ({ type: "other" }))
    );
    expect(many.length).toBe(100);
  });
});
