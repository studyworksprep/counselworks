"use server";

import { revalidateCollegeWorkspaces } from "../colleges/revalidate";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  AuthorizationError,
  requireStaff,
  requireStudentAccess,
} from "../auth/authorize";
import { reconcileTaskWorkflow } from "../workflows/tasks-sync";
import { requireEssayWriteAccess } from "../auth/essays";
import { feedbackInputSchema } from "../essays/drafting";
import { ESSAY_STATUS_VALUES } from "../constants/essays";

const ESSAY_VISIBILITY = new Set(["staff", "student", "family"]);
export async function createEssayDraft(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const title = formData.get("title") as string;
  const studentId = formData.get("student_id") as string;
  const essayType = formData.get("essay_type") as string;

  if (!studentId) return { error: "Student is required" };
  if (!essayType) return { error: "Essay type is required" };

  const wordCountTarget = formData.get("word_count_target") as string;
  const initialBody = (formData.get("body") as string) || "";

  const db = getDb();
  try {
    requireStaff(ctx);
    await requireStudentAccess(db, ctx, studentId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Student not found" };
    throw e;
  }

  // Explicit audience decision: essays default to "student" so the writer
  // can actually write. Staff-only is an explicit choice for internal
  // drafting.
  const visibility =
    (formData.get("visibility_scope") as string) || "student";
  if (!ESSAY_VISIBILITY.has(visibility)) {
    return { error: "Invalid visibility" };
  }

  // Optional college link; the matching application (if any) links too.
  const studentCollegeId =
    (formData.get("student_college_id") as string) || null;
  let applicationId: string | null = null;
  if (studentCollegeId) {
    const { data: sc } = await db
      .from("student_colleges")
      .select("id, student_id")
      .eq("id", studentCollegeId)
      .eq("firm_id", ctx.firmId)
      .maybeSingle();
    if (!sc || sc.student_id !== studentId) {
      return { error: "College is not on this student's list" };
    }
    const { data: app } = await db
      .from("applications")
      .select("id")
      .eq("firm_id", ctx.firmId)
      .eq("student_college_id", studentCollegeId)
      .limit(1)
      .maybeSingle();
    applicationId = app?.id ?? null;
  }

  const { data, error } = await db
    .from("essay_drafts")
    .insert({
      firm_id: ctx.firmId,
      student_id: studentId,
      title: title || "Untitled Essay",
      essay_type: essayType,
      prompt_text: (formData.get("prompt_text") as string) || null,
      body: initialBody,
      word_count_target: wordCountTarget ? parseInt(wordCountTarget) : null,
      status: "draft",
      visibility_scope: visibility,
      student_college_id: studentCollegeId,
      application_id: applicationId,
      current_version_number: 1,
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create essay draft:", error);
    return { error: "Failed to create essay draft" };
  }

  // Create initial version
  await db.from("essay_draft_versions").insert({
    essay_draft_id: data.id,
    version_number: 1,
    body: initialBody,
    commentary: null,
    created_by_user_id: ctx.dbUserId,
  });

  revalidateCollegeWorkspaces();
  revalidatePath("/essays");
  return { id: data.id };
}

export async function updateEssayDraft(
  essayId: string,
  body: string,
  commentary?: string,
  options?: { autosave?: boolean }
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();

  try {
    await requireEssayWriteAccess(db, ctx, essayId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  const { data, error } = await db.rpc("write_essay", { p_firm: ctx.firmId, p_actor: ctx.dbUserId,
    p_essay: essayId, p_action: options?.autosave ? "autosave" : "save", p_body: body, p_commentary: commentary || null });
  if (error) return { error: error.message || "Failed to save changes" };
  const syncError = await refreshEssayWork(db, ctx, essayId);
  if (syncError) return { error: syncError };
  return { success: true, version: data.version as number };

}

/**
 * Student hands the draft back to the counselor. The counselor moves it
 * through revision_requested/approved/final with updateEssayStatus.
 */
export async function submitEssayForReview(essayId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (ctx.role !== "student") return { error: "Not authorized" };

  const db = getDb();
  try {
    await requireEssayWriteAccess(db, ctx, essayId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  const { error } = await db.rpc("write_essay", { p_firm: ctx.firmId, p_actor: ctx.dbUserId, p_essay: essayId, p_action: "submit" });
  if (error) return { error: error.message || "Failed to submit for review" };
  const syncError = await refreshEssayWork(db, ctx, essayId);
  return syncError ? { error: syncError } : { success: true };

}

/** Link/unlink an essay to a college on the student's list (staff). */
export async function updateEssayLink(
  essayId: string,
  studentCollegeId: string | null
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  let draft;
  try {
    requireStaff(ctx);
    draft = await requireEssayWriteAccess(db, ctx, essayId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  let applicationId: string | null = null;
  if (studentCollegeId) {
    const { data: sc } = await db
      .from("student_colleges")
      .select("id, student_id")
      .eq("id", studentCollegeId)
      .eq("firm_id", ctx.firmId)
      .maybeSingle();
    if (!sc || sc.student_id !== draft.student_id) {
      return { error: "College is not on this student's list" };
    }
    const { data: app } = await db
      .from("applications")
      .select("id")
      .eq("firm_id", ctx.firmId)
      .eq("student_college_id", studentCollegeId)
      .limit(1)
      .maybeSingle();
    applicationId = app?.id ?? null;
  }

  const { error } = await db
    .from("essay_drafts")
    .update({
      student_college_id: studentCollegeId,
      application_id: applicationId,
      updated_by_user_id: ctx.dbUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", essayId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to link essay" };

  revalidateCollegeWorkspaces();
  revalidatePath(`/essays/${essayId}`);
  revalidateCollegeWorkspaces();
  revalidatePath("/essays");
  return { success: true };
}

/** Change who can see an essay (staff). */
export async function updateEssayVisibility(
  essayId: string,
  visibility: string
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!ESSAY_VISIBILITY.has(visibility)) return { error: "Invalid visibility" };

  const db = getDb();
  try {
    requireStaff(ctx);
    await requireEssayWriteAccess(db, ctx, essayId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  const { error } = await db
    .from("essay_drafts")
    .update({
      visibility_scope: visibility,
      updated_by_user_id: ctx.dbUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", essayId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to update visibility" };

  revalidateCollegeWorkspaces();
  revalidatePath(`/essays/${essayId}`);
  revalidateCollegeWorkspaces();
  revalidatePath("/essays");
  revalidatePath("/student-essays");
  return { success: true };
}

export async function updateEssayStatus(essayId: string, status: string, expectedVersion: string | null = null, feedback = "") {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  // Shared enum only (fix plan 7.7) — no second spelling can be stored.
  if (!ESSAY_STATUS_VALUES.has(status)) {
    return { error: "Invalid essay status" };
  }

  const db = getDb();
  try {
    requireStaff(ctx);
    await requireEssayWriteAccess(db, ctx, essayId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }
  const { error } = await db.rpc("write_essay", { p_firm: ctx.firmId, p_actor: ctx.dbUserId,
    p_essay: essayId, p_action: status === "in_review" ? "submit" : status, p_expected: expectedVersion, p_feedback: feedback });
  if (error) return { error: error.message || "Failed to update status" };
  const syncError = await refreshEssayWork(db, ctx, essayId);
  return syncError ? { error: syncError } : { success: true };

}

export async function updateEssayTitle(essayId: string, title: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  try {
    requireStaff(ctx);
    await requireEssayWriteAccess(db, ctx, essayId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }
  const { error } = await db
    .from("essay_drafts")
    .update({
      title,
      updated_by_user_id: ctx.dbUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", essayId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to update title" };

  revalidateCollegeWorkspaces();
  revalidatePath("/essays");
  revalidateCollegeWorkspaces();
  revalidatePath(`/essays/${essayId}`);
  return { success: true };
}

export async function deleteEssayDraft(essayId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  try {
    requireStaff(ctx);
    await requireEssayWriteAccess(db, ctx, essayId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }
  // One statement lets the database cascade versions atomically. Linked work
  // can refuse deletion without first removing the essay's saved history.
  const { error } = await db
    .from("essay_drafts")
    .delete()
    .eq("id", essayId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: error.code === "23503" ? "This essay has linked revision or submission work and must be kept for its history." : "Failed to delete essay" };

  revalidateCollegeWorkspaces();
  revalidatePath("/essays");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Coaching feedback (fix plan 10.3)
// ---------------------------------------------------------------------------

/**
 * Add a feedback comment — counselors coach, students reply. Both sides of
 * the loop use the same action; access mirrors essay write access (staff
 * with student access, or the essay's own student when shared).
 */
export async function addEssayFeedback(
  essayId: string,
  input: {
    versionNumber: number;
    body: string;
    quotedText?: string | null;
    anchorStart?: number | null;
    anchorEnd?: number | null;
  }
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const parsed = feedbackInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the comment and saved version before posting." };
  const p = parsed.data, body = p.body;

  const db = getDb();
  try {
    await requireEssayWriteAccess(db, ctx, essayId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  if (!Number.isInteger(p.versionNumber) || p.versionNumber < 1) return { error: "Reload the saved draft before adding feedback." };
  const { data: version, error: versionError } = await db.from("essay_draft_versions").select("body,essay_drafts!essay_draft_versions_essay_draft_id_fkey!inner(firm_id)")
    .eq("essay_draft_id", essayId).eq("version_number", p.versionNumber).eq("essay_drafts.firm_id", ctx.firmId).maybeSingle();
  if (versionError || !version) return { error: "Save the draft before adding feedback on this version." };
  if (p.quotedText && (p.anchorStart == null || p.anchorEnd == null || version.body?.slice(p.anchorStart, p.anchorEnd) !== p.quotedText)) return { error: "Save the draft before quoting this passage, then select it again. Your comment is still here." };

  const { error } = await db.from("essay_feedback").insert({
    firm_id: ctx.firmId,
    essay_draft_id: essayId,
    version_number: p.versionNumber,
    author_user_id: ctx.dbUserId,
    body,
    quoted_text: p.quotedText || null,
    anchor_start: p.anchorStart ?? null,
    anchor_end: p.anchorEnd ?? null,
  });
  if (error) return { error: "Failed to add comment" };

  revalidateCollegeWorkspaces();
  revalidatePath(`/essays/${essayId}`);
  revalidatePath(`/student-essays/${essayId}`);
  return { success: true };
}

export async function resolveEssayFeedback(feedbackId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  const { data: feedback } = await db
    .from("essay_feedback")
    .select("id, essay_draft_id")
    .eq("id", feedbackId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!feedback) return { error: "Comment not found" };

  try {
    await requireEssayWriteAccess(db, ctx, feedback.essay_draft_id);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  const { error } = await db
    .from("essay_feedback")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", feedbackId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to resolve comment" };

  revalidatePath(`/essays/${feedback.essay_draft_id}`);
  revalidatePath(`/student-essays/${feedback.essay_draft_id}`);
  return { success: true };
}

async function refreshEssayWork(db: ReturnType<typeof getDb>, ctx: NonNullable<Awaited<ReturnType<typeof resolveUserAndFirm>>>, essayId: string) {
  revalidateCollegeWorkspaces();
  for (const path of ["/essays", "/student-essays", `/essays/${essayId}`, `/student-essays/${essayId}`, "/tasks", "/tasks/review", "/dashboard", "/student-tasks", "/family-tasks", "/student-workflows", "/family-workflows", "/student-dashboard", "/family-dashboard"]) revalidatePath(path);
  const { data: tasks, error } = await db.from("tasks").select("id, student_id").eq("firm_id", ctx.firmId)
    .eq("related_entity_type", "essay").eq("related_entity_id", essayId).is("archived_at", null);
  if (error) return "Essay saved; linked tasks could not be refreshed. Open the task and retry workflow.";
  let syncFailed = false;
  for (const task of tasks ?? []) {
    for (const prefix of ["tasks", "student-tasks", "family-tasks"]) revalidatePath(`/${prefix}/${task.id}`);
    if (task.student_id) revalidatePath(`/students/${task.student_id}`, "layout");
    const result = await reconcileTaskWorkflow(db, task.id, ctx);
    if (result.error) syncFailed = true;
  }
  return syncFailed ? "Essay saved; next tasks could not be created. Open the linked task and choose Retry workflow." : null;
}
