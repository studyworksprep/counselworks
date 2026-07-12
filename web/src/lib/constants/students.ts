/**
 * Single source of truth for the student status enum (CLAUDE.md rule 4).
 * Historical bug: the roster filter and badges used "paused" while the edit
 * form wrote "inactive" — an "inactive" student vanished from the Paused
 * filter and rendered an unknown gray badge. Migration 00021 remaps existing
 * rows and adds a CHECK constraint so a second spelling can never come back.
 */

export type StudentStatus = "active" | "paused" | "graduated" | "archived";

type BadgeVariant = "success" | "warning" | "danger" | "default" | "primary";

export const STUDENT_STATUSES: {
  value: StudentStatus;
  label: string;
  badge: BadgeVariant;
}[] = [
  { value: "active", label: "Active", badge: "success" },
  { value: "paused", label: "Paused", badge: "warning" },
  { value: "graduated", label: "Graduated", badge: "primary" },
  { value: "archived", label: "Archived", badge: "default" },
];

export const STUDENT_STATUS_VALUES = new Set<string>(
  STUDENT_STATUSES.map((s) => s.value)
);

export const STUDENT_STATUS_LABELS: Record<string, string> =
  Object.fromEntries(STUDENT_STATUSES.map((s) => [s.value, s.label]));

export const STUDENT_STATUS_BADGES: Record<string, BadgeVariant> =
  Object.fromEntries(STUDENT_STATUSES.map((s) => [s.value, s.badge]));

/**
 * Statuses the edit form may write. "archived" is deliberately excluded:
 * archiving goes through archiveStudent/archiveFamily, which also stamp
 * archived_at — the edit form's status dropdown used to write "archived"
 * without it, leaving "archived" students in the roster (fix plan 7.5).
 */
export const EDITABLE_STUDENT_STATUSES = STUDENT_STATUSES.filter(
  (s) => s.value !== "archived"
);

export const EDITABLE_STUDENT_STATUS_VALUES = new Set<string>(
  EDITABLE_STUDENT_STATUSES.map((s) => s.value)
);
