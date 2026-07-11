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
