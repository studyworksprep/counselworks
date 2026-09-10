import { isStaffRole } from "./roles";
/**
 * Single source of truth for task enums — imported by every writer and every
 * label map (CLAUDE.md rule 4: never introduce a second spelling).
 */

export const TASK_STATUS_VALUES = new Set(["pending", "in_progress", "completed", "cancelled", "submitted", "changes_requested"]);

/** Portal owners can work on open tasks or reopen their own completion. */
export function taskTransitionAllowed(from: string, to: string, portal: boolean, taskType: string): boolean {
  if (!TASK_STATUS_VALUES.has(from) || !TASK_STATUS_VALUES.has(to)) return false;
  if (!portal) return true;
  if (taskType === "review" || from === "cancelled" || to === "cancelled") return false;
  return from === to || (from === "completed" ? to === "pending" : to !== "cancelled");
}

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

export const TASK_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

export const TASK_PRIORITY_VALUES = new Set<string>(
  TASK_PRIORITY_OPTIONS.map((o) => o.value)
);

/** Recurring task cadences (fix plan 13.3) — the only spelling anywhere. */
export const TASK_CADENCE_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

export type TaskCadence = (typeof TASK_CADENCE_OPTIONS)[number]["value"];

export const TASK_CADENCE_VALUES = new Set<string>(
  TASK_CADENCE_OPTIONS.map((o) => o.value)
);

export const TASK_COMPLETION_MODES = [
  { value: "simple", label: "Mark complete" },
  { value: "evidence", label: "Submit evidence" },
  { value: "review_required", label: "Counselor approval required" },
] as const;
export const TASK_COMPLETION_MODE_VALUES = new Set<string>(TASK_COMPLETION_MODES.map(m => m.value));
export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "To do", in_progress: "In progress", submitted: "Submitted for review",
  changes_requested: "Changes requested", completed: "Complete", cancelled: "Cancelled",
};
export function canSimplyComplete(task: { completion_mode?: string; dependency_blocked?: boolean; needs_attention?: boolean; status: string }) {
  return (task.completion_mode ?? "simple") === "simple" && !task.dependency_blocked && !task.needs_attention && !["submitted", "cancelled"].includes(task.status);
}

export const TASK_OPEN_STATUSES = ["pending", "in_progress", "submitted", "changes_requested"];

/** Global Tasks URL default only; omitted embedded query filters keep their scope. */
export function normalizeTaskView(value: unknown): "my" | "team" | "student" {
  const view = Array.isArray(value) ? value[0] : value;
  return view === "team" || view === "student" ? view : "my";
}

export const TASK_STATUS_OPTIONS = Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({ value, label }));
export function taskPriorityLabel(value: string) {
  return TASK_PRIORITY_OPTIONS.find(option => option.value === value)?.label ?? "Unknown priority";
}

export function taskOwnerRoleLabel(role: string | null) {
  if (isStaffRole(role ?? "")) return "Counseling team";
  if (role === "parent" || role === "parent_guardian") return "Parent or guardian";
  if (role === "student") return "Student";
  return "Responsible person";
}

export const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started", in_progress: "In progress", completed: "Complete", paused: "Paused", cancelled: "Cancelled",
};
