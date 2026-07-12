/**
 * Single source of truth for application enums (CLAUDE.md rule 4).
 * Historical bug: /applications/new wrote long codes (early_action) while
 * list-derived creation wrote short codes (ea), silently breaking deadline
 * anchors and labels. Short codes are canonical (migration 00020 normalizes
 * existing rows).
 */

export const APPLICATION_ROUNDS = [
  { value: "ea", label: "Early Action", short: "EA" },
  { value: "ed", label: "Early Decision", short: "ED" },
  { value: "ed2", label: "Early Decision II", short: "ED II" },
  { value: "rea", label: "Restrictive Early Action", short: "REA" },
  { value: "rd", label: "Regular Decision", short: "RD" },
  { value: "rolling", label: "Rolling", short: "Rolling" },
] as const;

export const ROUND_VALUES = new Set<string>(
  APPLICATION_ROUNDS.map((r) => r.value)
);

export const ROUND_SHORT_LABELS: Record<string, string> = Object.fromEntries(
  APPLICATION_ROUNDS.map((r) => [r.value, r.short])
);

export const ROUND_FULL_LABELS: Record<string, string> = Object.fromEntries(
  APPLICATION_ROUNDS.map((r) => [r.value, r.label])
);

/**
 * Application pipeline stages — one definition for the kanban board, the
 * detail page, and stage validation (fix plan 7.6). `boardColor` is the
 * kanban column tint.
 */
export const APPLICATION_STAGES = [
  { value: "not_started", label: "Not Started", boardColor: "bg-gray-50" },
  { value: "in_progress", label: "In Progress", boardColor: "bg-blue-50" },
  { value: "submitted", label: "Submitted", boardColor: "bg-yellow-50" },
  { value: "under_review", label: "Under Review", boardColor: "bg-purple-50" },
  {
    value: "decision_received",
    label: "Decision Received",
    boardColor: "bg-green-50",
  },
  { value: "withdrawn", label: "Withdrawn", boardColor: "bg-red-50" },
] as const;

export const STAGE_VALUES = new Set<string>(
  APPLICATION_STAGES.map((s) => s.value)
);

export const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  APPLICATION_STAGES.map((s) => [s.value, s.label])
);

/**
 * Stages the kanban dropdown may write. "decision_received" is deliberately
 * excluded: the Record Decision modal is the ONLY writer of that stage — it
 * also records the result/date and syncs student_colleges, so reaching the
 * stage without a decision desyncs the reports and portals (fix plan 7.6).
 */
export const KANBAN_SETTABLE_STAGES = APPLICATION_STAGES.filter(
  (s) => s.value !== "decision_received"
);

export const KANBAN_SETTABLE_STAGE_VALUES = new Set<string>(
  KANBAN_SETTABLE_STAGES.map((s) => s.value)
);

export const DECISION_RESULTS = [
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Denied" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "deferred", label: "Deferred" },
] as const;

export const DECISION_VALUES = new Set<string>(
  DECISION_RESULTS.map((d) => d.value)
);

export const DEPOSIT_STATUS_OPTIONS = [
  { value: "", label: "—" },
  { value: "committed", label: "Committed (deposit paid)" },
  { value: "declined", label: "Offer declined" },
] as const;

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

/**
 * Default per-application requirements checklist. Round- and aid-aware;
 * stored on applications.checklist_json at creation (or first open for
 * legacy rows) and checked off on the application detail page.
 */
export function buildDefaultChecklist(options: {
  round: string | null;
  financialAidRequired?: boolean;
}): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { key: "application_form", label: "Application form completed", done: false },
    { key: "personal_statement", label: "Personal statement final", done: false },
    { key: "supplements", label: "Supplemental essays final", done: false },
    { key: "transcript", label: "Transcript requested & sent", done: false },
    { key: "test_scores", label: "Test scores sent (or test-optional decision made)", done: false },
    { key: "recommendations", label: "Recommendation letters submitted", done: false },
    { key: "fee", label: "Application fee paid / waiver applied", done: false },
  ];
  if (options.financialAidRequired) {
    items.push(
      { key: "fafsa", label: "FAFSA submitted", done: false },
      { key: "css_profile", label: "CSS Profile submitted (if required)", done: false }
    );
  }
  if (options.round === "ed" || options.round === "ed2") {
    items.push({
      key: "ed_agreement",
      label: "Early Decision agreement signed",
      done: false,
    });
  }
  items.push({ key: "final_review", label: "Final line-by-line review", done: false });
  return items;
}

/** Parse checklist_json defensively; null → needs seeding with the default. */
export function parseChecklist(value: unknown): ChecklistItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const items = value
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object"
    )
    .map((item) => ({
      key: String(item.key ?? ""),
      label: String(item.label ?? ""),
      done: item.done === true,
    }))
    .filter((item) => item.key && item.label);
  return items.length > 0 ? items : null;
}

// ---------------------------------------------------------------------------
// Round → deadline anchoring (fix plan 8.7)
// ---------------------------------------------------------------------------

export interface RoundAnchor {
  /** 1-12 */
  month: number;
  day: number;
}

/**
 * Default deadline anchor per round, as month/day. The year is derived from
 * the student's graduation year: months Aug–Dec fall in senior fall
 * (graduation year - 1), Jan–Jul in the graduation year itself. Firms can
 * override month/day per round in Settings
 * (firm_settings.round_deadline_defaults_json, migration 00022).
 */
export const DEFAULT_ROUND_ANCHORS: Record<string, RoundAnchor | null> = {
  ea: { month: 11, day: 1 },
  ed: { month: 11, day: 1 },
  rea: { month: 11, day: 1 },
  ed2: { month: 1, day: 1 },
  rd: { month: 1, day: 15 },
  rolling: null, // rolling admission has no meaningful default deadline
};

/** Parse the firm override JSON defensively ({ round: { month, day } }). */
export function parseRoundAnchorOverrides(
  value: unknown
): Record<string, RoundAnchor> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, RoundAnchor> = {};
  for (const [round, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!ROUND_VALUES.has(round) || !raw || typeof raw !== "object") continue;
    const month = Number((raw as { month?: unknown }).month);
    const day = Number((raw as { day?: unknown }).day);
    if (
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12 &&
      Number.isInteger(day) &&
      day >= 1 &&
      day <= 31
    ) {
      out[round] = { month, day };
    }
  }
  return out;
}

/**
 * The anchored default deadline (YYYY-MM-DD) for a round and class year, or
 * null when the round has no default (rolling / unknown round). Always
 * editable after creation — this only replaces 100+ hand-typed dates per
 * season with a sane starting point.
 */
export function anchorDeadline(
  round: string | null,
  graduationYear: number | null,
  overrides: Record<string, RoundAnchor> = {}
): string | null {
  if (!round || !graduationYear || !Number.isInteger(graduationYear)) {
    return null;
  }
  const anchor = overrides[round] ?? DEFAULT_ROUND_ANCHORS[round] ?? null;
  if (!anchor) return null;
  const year = anchor.month >= 8 ? graduationYear - 1 : graduationYear;
  const mm = String(anchor.month).padStart(2, "0");
  const dd = String(anchor.day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}
