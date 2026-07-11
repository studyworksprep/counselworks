/**
 * Single source of truth for task enums — imported by every writer and every
 * label map (CLAUDE.md rule 4: never introduce a second spelling).
 */

export const TASK_TYPE_OPTIONS = [
  { value: "general", label: "General" },
  { value: "follow_up", label: "Follow Up" },
  { value: "review", label: "Review" },
  { value: "deadline", label: "Deadline" },
  { value: "meeting_prep", label: "Meeting Prep" },
  { value: "document_request", label: "Document Request" },
] as const;

export const TASK_TYPE_VALUES = new Set<string>(
  TASK_TYPE_OPTIONS.map((o) => o.value)
);

export const TASK_VISIBILITY_OPTIONS = [
  { value: "staff", label: "Staff only" },
  { value: "student", label: "Student (visible in student portal)" },
  { value: "family", label: "Student + family (visible in both portals)" },
] as const;

export const TASK_VISIBILITY_VALUES = new Set<string>(
  TASK_VISIBILITY_OPTIONS.map((o) => o.value)
);
