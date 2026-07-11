"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm, isStaffRole } from "../auth/resolve";
import {
  AuthorizationError,
  requireStaff,
  requireStudentAccess,
} from "../auth/authorize";

const ESSAY_VISIBILITY = new Set(["staff", "student", "family"]);
const PORTAL_EDITABLE_SCOPES = new Set(["student", "family"]);

/**
 * Load a draft and verify the actor may WRITE it: staff with student access,
 * or the student themselves when the draft is shared (student/family scope).
 */
async function requireEssayWriteAccess(
  db: ReturnType<typeof getDb>,
  ctx: NonNullable<Awaited<ReturnType<typeof resolveUserAndFirm>>>,
  essayId: string
) {
  const { data: draft } = await db
    .from("essay_drafts")
    .select(
      "id, student_id, visibility_scope, status, current_version_number, student_college_id, application_id"
    )
    .eq("id", essayId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!draft) throw new AuthorizationError("Essay not found");

  if (isStaffRole(ctx.role)) {
    await requireStudentAccess(db, ctx, draft.student_id);
    return draft;
  }
  if (ctx.role === "student") {
    if (!PORTAL_EDITABLE_SCOPES.has(draft.visibility_scope)) {
      throw new AuthorizationError("Essay not found");
    }
    const { data: own } = await db
      .from("students")
      .select("id")
      .eq("firm_id", ctx.firmId)
      .eq("user_id", ctx.dbUserId)
      .eq("id", draft.student_id)
      .maybeSingle();
    if (!own) throw new AuthorizationError("Essay not found");
    // Locked drafts are read-only for the student.
    if (draft.status === "approved" || draft.status === "final") {
      throw new AuthorizationError(
        "This essay has been finalized by your counselor"
      );
    }
    return draft;
  }
  throw new AuthorizationError("Essay not found");
}

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

  revalidatePath("/essays");
  return { id: data.id };
}

export async function updateEssayDraft(
  essayId: string,
  body: string,
  commentary?: string
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();

  let draft;
  try {
    draft = await requireEssayWriteAccess(db, ctx, essayId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  const nextVersion = draft.current_version_number + 1;

  // Update draft body and bump version
  const { error: updateError } = await db
    .from("essay_drafts")
    .update({
      body,
      current_version_number: nextVersion,
      updated_by_user_id: ctx.dbUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", essayId)
    .eq("firm_id", ctx.firmId);

  if (updateError) {
    console.error("Failed to update essay draft:", updateError);
    return { error: "Failed to save changes" };
  }

  // Create version snapshot
  await db.from("essay_draft_versions").insert({
    essay_draft_id: essayId,
    version_number: nextVersion,
    body,
    commentary: commentary || null,
    created_by_user_id: ctx.dbUserId,
  });

  revalidatePath("/essays");
  revalidatePath(`/essays/${essayId}`);
  revalidatePath("/student-essays");
  revalidatePath(`/student-essays/${essayId}`);
  return { success: true, version: nextVersion };
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

  const { error } = await db
    .from("essay_drafts")
    .update({
      status: "in_review",
      updated_by_user_id: ctx.dbUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", essayId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to submit for review" };

  revalidatePath("/essays");
  revalidatePath("/student-essays");
  revalidatePath(`/student-essays/${essayId}`);
  return { success: true };
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

  revalidatePath(`/essays/${essayId}`);
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

  revalidatePath(`/essays/${essayId}`);
  revalidatePath("/essays");
  revalidatePath("/student-essays");
  return { success: true };
}

export async function updateEssayStatus(essayId: string, status: string) {
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
      status,
      updated_by_user_id: ctx.dbUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", essayId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to update status" };

  revalidatePath("/essays");
  revalidatePath(`/essays/${essayId}`);
  return { success: true };
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

  revalidatePath("/essays");
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
  // Delete versions first (cascade should handle it, but be explicit)
  await db
    .from("essay_draft_versions")
    .delete()
    .eq("essay_draft_id", essayId);

  const { error } = await db
    .from("essay_drafts")
    .delete()
    .eq("id", essayId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to delete essay" };

  revalidatePath("/essays");
  return { success: true };
}
