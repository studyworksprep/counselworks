/** Persisted task relationship names; reuse tasks.related_entity_* and application_id. */
export const TASK_RESOURCE_KINDS = ["essay", "document", "document_request", "application"] as const;
export type TaskResourceKind = typeof TASK_RESOURCE_KINDS[number];
export type TaskSurface = "staff" | "student" | "family";
export function taskPath(id: string, surface?: TaskSurface): string {
  return `${surface === "staff" ? "/tasks" : surface === "student" ? "/student-tasks" : surface === "family" ? "/family-tasks" : "/task"}/${encodeURIComponent(id)}`;
}
export function taskSurface(role: string): TaskSurface {
  return role === "student" ? "student" : role === "parent_guardian" ? "family" : "staff";
}
export interface TaskResourceLink { id: string; kind: TaskResourceKind; title: string; href: string; action: string; status?: string; applicationId?: string | null }
