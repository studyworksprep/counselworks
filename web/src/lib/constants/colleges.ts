/**
 * College-list enums (student_colleges.category and .status) — one spelling
 * for the writers and every label map (CLAUDE.md rule 4). The staff list, both
 * portal list pages, the print view, and the add action each kept a copy.
 */

export const COLLEGE_LIST_CATEGORIES = [
  { value: "safety", label: "Safety" },
  { value: "likely", label: "Likely" },
  { value: "target", label: "Target" },
  { value: "reach", label: "Reach" },
  { value: "far_reach", label: "Far Reach" },
] as const;

export const COLLEGE_LIST_CATEGORY_VALUES = new Set<string>(
  COLLEGE_LIST_CATEGORIES.map((c) => c.value)
);

export const COLLEGE_LIST_CATEGORY_LABELS: Record<string, string> =
  Object.fromEntries(COLLEGE_LIST_CATEGORIES.map((c) => [c.value, c.label]));

/** Values the staff list may set. New rows start at "researching". */
export const COLLEGE_LIST_STATUSES = [
  { value: "researching", label: "Researching" },
  { value: "considering", label: "Considering" },
  { value: "applying", label: "Applying" },
  { value: "applied", label: "Applied" },
  { value: "removed", label: "Removed" },
] as const;

export const COLLEGE_LIST_STATUS_LABELS: Record<string, string> =
  Object.fromEntries(COLLEGE_LIST_STATUSES.map((s) => [s.value, s.label]));
