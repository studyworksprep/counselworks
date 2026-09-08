import { describe, expect, it } from "vitest";
import {
  actToSat,
  anonymizeOutcomes,
  buildScattergram,
  gpaForPlot,
  OUTCOME_MARKS,
  PORTAL_MIN_DECISIONS,
  portalHistoryVisible,
  testScoreForPlot,
  type OutcomePoint,
} from "@/lib/colleges/scattergram";
import { DECISION_RESULTS } from "@/lib/constants/applications";

function point(over: Partial<OutcomePoint> = {}): OutcomePoint {
  return {
    id: "app-1",
    decision_result: "accepted",
    application_type: "rd",
    graduation_year: 2027,
    gpa: 3.8,
    gpa_scale: "unweighted",
    sat: 1450,
    act: null,
    student_id: "s-1",
    student_name: "Sam Student",
    ...over,
  };
}

describe("score and GPA selection (fix plan 13.2)", () => {
  it("prefers the SAT and concords the ACT only when there is no SAT", () => {
    expect(testScoreForPlot(1450, 34)).toEqual({ value: 1450, source: "sat" });
    expect(testScoreForPlot(null, 32)).toEqual({ value: 1430, source: "act" });
    expect(testScoreForPlot(null, null)).toBeNull();
    expect(actToSat(36)).toBe(1590);
    expect(actToSat(8)).toBeNull();
  });
  it("prefers the unweighted GPA and falls back to weighted", () => {
    expect(gpaForPlot(3.8, 4.4)).toEqual({ value: 3.8, scale: "unweighted" });
    expect(gpaForPlot(null, 4.4)).toEqual({ value: 4.4, scale: "weighted" });
    expect(gpaForPlot(null, null)).toBeNull();
  });
});

describe("buildScattergram", () => {
  it("plots rows with both axes and lists the rest, counting every outcome", () => {
    const s = buildScattergram([
      point(),
      point({ id: "app-2", decision_result: "rejected", sat: null, act: 30 }),
      point({ id: "app-3", decision_result: "waitlisted", gpa: null }),
      point({ id: "app-4", decision_result: "deferred", sat: null, act: null }),
    ]);
    expect(s.total).toBe(4);
    expect(s.plotted.map((p) => p.id)).toEqual(["app-1", "app-2"]);
    expect(s.plotted[1]).toMatchObject({ x: 1370, x_source: "act", y: 3.8 });
    expect(s.unplotted.map((p) => p.id)).toEqual(["app-3", "app-4"]);
    expect(s.counts).toEqual({ accepted: 1, rejected: 1, waitlisted: 1, deferred: 1 });
  });
  it("keeps the GPA axis at 2.0–4.0 unless the data goes outside", () => {
    expect(buildScattergram([point()])).toMatchObject({ yMin: 2, yMax: 4 });
    expect(buildScattergram([point({ gpa: 4.6, gpa_scale: "weighted" })])).toMatchObject({ yMax: 5 });
    expect(buildScattergram([point({ gpa: 1.7 })])).toMatchObject({ yMin: 1.5 });
  });
  it("has a mark for every decision result, each with a distinct shape", () => {
    const values = OUTCOME_MARKS.map((m) => m.value).sort();
    expect(values).toEqual(DECISION_RESULTS.map((d) => d.value).sort());
    expect(new Set(OUTCOME_MARKS.map((m) => m.shape)).size).toBe(OUTCOME_MARKS.length);
  });
});

describe("portal anonymization", () => {
  it("strips identity and class year and re-keys by score order", () => {
    const anon = anonymizeOutcomes([
      point({ id: "app-9", sat: 1500 }),
      point({ id: "app-8", sat: 1200, student_name: "Other Kid", student_id: "s-2" }),
    ]);
    expect(anon.map((p) => p.id)).toEqual(["anon-0", "anon-1"]);
    expect(anon[0]).toMatchObject({ sat: 1200, student_id: null, student_name: null, graduation_year: null });
    for (const p of anon) {
      expect(Object.keys(p).sort()).toEqual(
        ["act", "application_type", "decision_result", "gpa", "gpa_scale", "graduation_year", "id", "sat", "student_id", "student_name"]
      );
    }
  });
  it("hides history below the privacy floor", () => {
    expect(portalHistoryVisible(PORTAL_MIN_DECISIONS - 1)).toBe(false);
    expect(portalHistoryVisible(PORTAL_MIN_DECISIONS)).toBe(true);
  });
});
