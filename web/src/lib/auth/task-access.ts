import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthorizationError, documentReadAllowed, resolveStudentRelationship, type ActorContext } from "./authorize";
import { isStaffRole, isFirmWideRole } from "./resolve";
import { taskSurface, type TaskResourceKind, type TaskResourceLink } from "../constants/task-links";

/** UUID reads must never grant more access than persona-specific task lists. */
export async function requireTaskReadAccess(db: SupabaseClient, ctx: ActorContext, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new AuthorizationError("Task not found");
  const { data: task, error } = await db.from("tasks").select(`id, title, description, task_type, status, priority,
    visibility_scope, due_at, due_on, due_timezone, completed_at, student_id, assigned_user_id, created_by_user_id, owner_role,
    owner_pending, completion_mode, reviewer_user_id, submitted_version_id, submitted_document_id, review_feedback, dependency_blocked, needs_attention, application_id, related_entity_type, related_entity_id,
    assignee:assigned_user_id(first_name, last_name), reviewer:reviewer_user_id(first_name, last_name), students(first_name, last_name)`)
    .eq("firm_id", ctx.firmId).eq("id", id).is("archived_at", null).maybeSingle();
  if (error) throw new Error("Unable to load task");
  if (!task) throw new AuthorizationError("Task not found");
  const relationship = await resolveStudentRelationship(db, ctx, task.student_id);
  if (!documentReadAllowed(task.visibility_scope, relationship) || (task.owner_pending && !isStaffRole(ctx.role))) {
    throw new AuthorizationError("Task not found");
  }
  if (!task.student_id && !isFirmWideRole(ctx.role) && task.assigned_user_id !== ctx.dbUserId && task.created_by_user_id !== ctx.dbUserId) {
    throw new AuthorizationError("Task not found");
  }
  return { task, relationship };
}

/** Resource access is independent of task visibility. Never expose a private title via a shared task. */
export async function requireTaskResourceAccess(db: SupabaseClient, ctx: ActorContext, studentId: string | null,
  kind: TaskResourceKind, id: string): Promise<TaskResourceLink> {
  if (!studentId) throw new AuthorizationError("Link a student first");
  const relationship = await resolveStudentRelationship(db, ctx, studentId);
  if (!documentReadAllowed("family", relationship)) throw new AuthorizationError();
  const surface = taskSurface(ctx.role);
  if (kind === "application") {
    const { data, error } = await db.from("applications").select("id, student_id, colleges(name)")
      .eq("firm_id", ctx.firmId).eq("id", id).eq("student_id", studentId).maybeSingle();
    if (error) throw new Error("Unable to load application");
    if (!data) throw new AuthorizationError();
    const college = Array.isArray(data.colleges) ? data.colleges[0] : data.colleges;
    return { kind, id, title: college?.name ?? "Application", action: "Open application checklist",
      href: surface === "staff" ? `/applications/${id}` : `/${surface}-applications#application-${id}` };
  }
  if (kind === "document_request") {
    const { data, error } = await db.from("document_requests").select("id, title, student_id, family_id, status")
      .eq("firm_id", ctx.firmId).eq("id", id).maybeSingle();
    if (error) throw new Error("Unable to load document request");
    if (!data) throw new AuthorizationError();
    if (data.student_id !== studentId) {
      if (data.student_id || !data.family_id) throw new AuthorizationError();
      const { data: student } = await db.from("students").select("id").eq("firm_id", ctx.firmId)
        .eq("id", studentId).eq("family_id", data.family_id).maybeSingle();
      if (!student) throw new AuthorizationError();
    }
    return { kind, id, title: data.title, status: data.status, action: "Open document request",
      href: surface === "staff" ? `/students/${studentId}/documents#request-${id}` : `/${surface}-documents#request-${id}` };
  }
  const table = kind === "essay" ? "essay_drafts" : "documents";
  let query = db.from(table).select("id, title, student_id, visibility_scope, application_id")
    .eq("firm_id", ctx.firmId).eq("id", id).eq("student_id", studentId);
  if (kind === "document") query = query.is("archived_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Unable to load linked work");
  if (!data || !documentReadAllowed(data.visibility_scope, relationship)) throw new AuthorizationError();
  // There is no parent essay editor/read route; preserve the existing access model.
  if (kind === "essay" && (surface === "family" || (surface === "student" && !["student", "family"].includes(data.visibility_scope)))) throw new AuthorizationError();
  return { kind, id, applicationId: data.application_id, title: data.title || (kind === "essay" ? "Essay" : "Document"),
    action: kind === "essay" ? "Open essay" : "Open document",
    href: kind === "essay" ? `${surface === "staff" ? "/essays" : "/student-essays"}/${id}`
      : surface === "staff" ? `/students/${studentId}/documents#document-${id}` : `/${surface}-documents#document-${id}` };
}
