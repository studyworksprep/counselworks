/**
 * Scattergrams / historical outcomes (fix plan 13.2) — pure logic, no I/O.
 *
 * A scattergram is the firm's own decision history at one college: every
 * decided application plotted by test score (x) × GPA (y), marked by
 * outcome. The data is the 10.2 decision roster; this module decides which
 * rows are plottable, on which scale, and what a portal viewer may see.
 */
import { DECISION_RESULTS } from "@/lib/constants/applications";

export type Outcome = (typeof DECISION_RESULTS)[number]["value"];

export interface OutcomePoint {
  /** Application id for staff; an opaque index once anonymized. */
  id: string;
  decision_result: string;
  application_type: string;
  /** Null on portal surfaces (class year could identify a classmate). */
  graduation_year: number | null;
  gpa: number | null;
  gpa_scale: "unweighted" | "weighted" | null;
  sat: number | null;
  act: number | null;
  /** Staff only, and only when the viewer may access the student. */
  student_id: string | null;
  student_name: string | null;
}

export interface PlottedPoint extends OutcomePoint {
  /** SAT-scale score (400–1600); ACT scores are concorded. */
  x: number;
  x_source: "sat" | "act";
  y: number;
}

/**
 * ACT composite → SAT total, official ACT/College Board 2018 concordance
 * (single-value midpoints). Lets a student with only an ACT sit on the
 * same axis; the tooltip always says when a score was concorded.
 */
export const ACT_TO_SAT: Record<number, number> = {
  36: 1590, 35: 1540, 34: 1500, 33: 1460, 32: 1430, 31: 1400, 30: 1370,
  29: 1340, 28: 1310, 27: 1280, 26: 1240, 25: 1210, 24: 1180, 23: 1140,
  22: 1110, 21: 1080, 20: 1040, 19: 1010, 18: 970, 17: 930, 16: 890,
  15: 850, 14: 800, 13: 760, 12: 710, 11: 670, 10: 630, 9: 590,
};

export const SAT_MIN = 400;
export const SAT_MAX = 1600;

/**
 * Portal viewers (students, parents) see the firm's anonymized history at a
 * college only once it holds this many decisions — below that, a handful
 * of points could identify a classmate. Deliberate privacy floor.
 */
export const PORTAL_MIN_DECISIONS = 3;

export function actToSat(act: number | null): number | null {
  if (act === null) return null;
  const rounded = Math.round(act);
  return ACT_TO_SAT[rounded] ?? null;
}

/** Plot x: the SAT total when there is one, else the concorded ACT. */
export function testScoreForPlot(
  sat: number | null,
  act: number | null
): { value: number; source: "sat" | "act" } | null {
  if (sat !== null && sat >= SAT_MIN && sat <= SAT_MAX) {
    return { value: sat, source: "sat" };
  }
  const concorded = actToSat(act);
  return concorded === null ? null : { value: concorded, source: "act" };
}

/**
 * Plot y: the unweighted GPA (4.0 scale) when recorded, else the weighted
 * one — the point is still informative, and the tooltip says which scale.
 */
export function gpaForPlot(
  unweighted: number | null,
  weighted: number | null
): { value: number; scale: "unweighted" | "weighted" } | null {
  if (unweighted !== null && unweighted > 0) {
    return { value: unweighted, scale: "unweighted" };
  }
  if (weighted !== null && weighted > 0) {
    return { value: weighted, scale: "weighted" };
  }
  return null;
}

export interface Scattergram {
  plotted: PlottedPoint[];
  /** Decided applications with no score or no GPA on file. */
  unplotted: OutcomePoint[];
  counts: Record<string, number>;
  total: number;
  /** GPA axis, half-point steps: [2.0, 4.0] unless the data goes outside. */
  yMin: number;
  yMax: number;
}

export function buildScattergram(points: OutcomePoint[]): Scattergram {
  const plotted: PlottedPoint[] = [];
  const unplotted: OutcomePoint[] = [];
  const counts: Record<string, number> = {};
  for (const d of DECISION_RESULTS) counts[d.value] = 0;

  for (const p of points) {
    counts[p.decision_result] = (counts[p.decision_result] ?? 0) + 1;
    const x = testScoreForPlot(p.sat, p.act);
    if (!x || p.gpa === null) {
      unplotted.push(p);
      continue;
    }
    plotted.push({ ...p, x: x.value, x_source: x.source, y: p.gpa });
  }

  let yMin = 2;
  let yMax = 4;
  for (const p of plotted) {
    if (p.y < yMin) yMin = Math.max(0, Math.floor(p.y * 2) / 2);
    if (p.y > yMax) yMax = Math.min(5, Math.ceil(p.y * 2) / 2);
  }

  return { plotted, unplotted, counts, total: points.length, yMin, yMax };
}

/**
 * What a portal viewer receives: outcome + scores only. No application id,
 * no student, no class year, and the order is shuffled deterministically
 * (sorted by score) so it cannot be matched back to the roster order.
 */
export function anonymizeOutcomes(points: OutcomePoint[]): OutcomePoint[] {
  return points
    .map((p) => ({
      decision_result: p.decision_result,
      application_type: p.application_type,
      gpa: p.gpa,
      gpa_scale: p.gpa_scale,
      sat: p.sat,
      act: p.act,
    }))
    .sort(
      (a, b) =>
        (a.sat ?? actToSat(a.act) ?? 0) - (b.sat ?? actToSat(b.act) ?? 0) ||
        (a.gpa ?? 0) - (b.gpa ?? 0)
    )
    .map((p, i) => ({
      ...p,
      id: `anon-${i}`,
      graduation_year: null,
      student_id: null,
      student_name: null,
    }));
}

export function portalHistoryVisible(total: number): boolean {
  return total >= PORTAL_MIN_DECISIONS;
}

/**
 * One mark per outcome: a status color (these mean good/bad, so they wear
 * the status tokens, validated for CVD separation across all pairs:
 * success-700 #15803d, danger-600 #dc2626, warning-500 #f59e0b,
 * primary-600 #4f46e5) AND a distinct shape, so outcome is never encoded
 * by color alone. Legend order is fixed.
 */
export const OUTCOME_MARKS: {
  value: Outcome;
  label: string;
  shape: "circle" | "cross" | "triangle" | "square";
  fillClass: string;
  textClass: string;
}[] = [
  { value: "accepted", label: "Accepted", shape: "circle", fillClass: "fill-success-700", textClass: "text-success-700" },
  { value: "waitlisted", label: "Waitlisted", shape: "triangle", fillClass: "fill-warning-500", textClass: "text-warning-500" },
  { value: "deferred", label: "Deferred", shape: "square", fillClass: "fill-primary-600", textClass: "text-primary-600" },
  { value: "rejected", label: "Denied", shape: "cross", fillClass: "fill-danger-600", textClass: "text-danger-600" },
];

export function outcomeMark(value: string) {
  return OUTCOME_MARKS.find((m) => m.value === value) ?? OUTCOME_MARKS[0];
}
