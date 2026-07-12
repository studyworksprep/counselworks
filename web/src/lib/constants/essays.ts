/**
 * Single source of truth for essay enums (CLAUDE.md rule 4, fix plan 7.7).
 * Historical defect: three hand-copied status badge maps (staff list, staff
 * editor, portal editor) rendered the SAME status in different colors, and
 * the two editors enforced different word limits.
 */

type BadgeVariant = "success" | "warning" | "danger" | "default" | "primary";

/**
 * One status row = one color everywhere, two label columns: `label` is the
 * staff-facing name; `portalLabel` is the student-facing phrasing of the
 * same state (e.g. in_review reads "With your counselor" in the portal).
 */
export const ESSAY_STATUSES: {
  value: string;
  label: string;
  portalLabel: string;
  badge: BadgeVariant;
}[] = [
  { value: "draft", label: "Draft", portalLabel: "Draft", badge: "default" },
  {
    value: "in_review",
    label: "In Review",
    portalLabel: "With your counselor",
    badge: "primary",
  },
  {
    value: "revision_requested",
    label: "Revision Requested",
    portalLabel: "Revision requested",
    badge: "warning",
  },
  {
    value: "approved",
    label: "Approved",
    portalLabel: "Approved",
    badge: "success",
  },
  { value: "final", label: "Final", portalLabel: "Final", badge: "success" },
];

export const ESSAY_STATUS_VALUES = new Set<string>(
  ESSAY_STATUSES.map((s) => s.value)
);

export const ESSAY_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  ESSAY_STATUSES.map((s) => [s.value, s.label])
);

export const ESSAY_STATUS_PORTAL_LABELS: Record<string, string> =
  Object.fromEntries(ESSAY_STATUSES.map((s) => [s.value, s.portalLabel]));

export const ESSAY_STATUS_BADGES: Record<string, BadgeVariant> =
  Object.fromEntries(ESSAY_STATUSES.map((s) => [s.value, s.badge]));

export const ESSAY_TYPE_LABELS: Record<string, string> = {
  personal_statement: "Personal Statement",
  common_app: "Common App",
  coalition_app: "Coalition App",
  supplemental: "Supplemental",
  scholarship: "Scholarship",
  why_us: "Why Us",
  activity_description: "Activity",
  additional_info: "Additional Info",
  other: "Other",
};

/**
 * One word-limit resolution rule for both editors (fix plan 7.7):
 * the AI prompt analysis' detected limit (word_count_limit) wins over the
 * manually entered target (word_count_target). Historically the staff editor
 * used the target only while the portal used limit ?? target, so the two
 * editors could disagree about "over limit".
 */
export function resolveWordLimit(essay: {
  word_count_limit?: number | null;
  word_count_target?: number | null;
}): number | null {
  return essay.word_count_limit ?? essay.word_count_target ?? null;
}
