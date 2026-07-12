"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  AuthorizationError,
  requireStaff,
  requireStudentAccess,
} from "../auth/authorize";

/**
 * Supplement prompt bank + bulk essay creation (fix plan 10.3).
 */

export async function saveEssayPrompt(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const promptId = (formData.get("prompt_id") as string) || null;
  const title = (formData.get("title") as string)?.trim();
  const promptText = (formData.get("prompt_text") as string)?.trim();
  const collegeId = (formData.get("college_id") as string) || null;
  const wordLimitRaw = formData.get("word_limit") as string;
  const wordLimit = wordLimitRaw ? parseInt(wordLimitRaw) : null;
  if (!title || !promptText) {
    return { error: "Title and prompt text are required" };
  }

  const db = getDb();
  const values = {
    title,
    prompt_text: promptText,
    college_id: collegeId,
    word_limit: wordLimit,
    updated_by_user_id: ctx.dbUserId,
  };
  if (promptId) {
    const { error } = await db
      .from("essay_prompts")
      .update(values)
      .eq("id", promptId)
      .eq("firm_id", ctx.firmId);
    if (error) return { error: "Failed to save prompt" };
  } else {
    const { error } = await db.from("essay_prompts").insert({
      firm_id: ctx.firmId,
      ...values,
      created_by_user_id: ctx.dbUserId,
    });
    if (error) return { error: "Failed to save prompt" };
  }
  revalidatePath("/essays");
  return { success: true };
}

export async function archiveEssayPrompt(promptId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }
  const db = getDb();
  const { error } = await db
    .from("essay_prompts")
    .update({ is_active: false, updated_by_user_id: ctx.dbUserId })
    .eq("id", promptId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to archive prompt" };
  revalidatePath("/essays");
  return { success: true };
}

/**
 * Bulk essay creation: instantiate the selected prompts as shared,
 * student-editable drafts for one student. College-linked prompts also link
 * the student's matching list row and application when they exist.
 */
export async function bulkCreateEssaysFromPrompts(
  studentId: string,
  promptIds: string[]
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (promptIds.length === 0) return { error: "Choose at least one prompt" };

  const db = getDb();
  try {
    requireStaff(ctx);
    await requireStudentAccess(db, ctx, studentId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Student not found" };
    throw e;
  }

  const { data: prompts } = await db
    .from("essay_prompts")
    .select("id, title, prompt_text, essay_type, word_limit, college_id")
    .eq("firm_id", ctx.firmId)
    .eq("is_active", true)
    .in("id", promptIds);
  if (!prompts || prompts.length === 0) return { error: "Prompts not found" };

  // Existing list rows / applications for college linking.
  const collegeIds = prompts.map((p) => p.college_id).filter(Boolean);
  const listRowByCollege = new Map<string, { id: string; appId: string | null }>();
  if (collegeIds.length > 0) {
    const { data: listRows } = await db
      .from("student_colleges")
      .select("id, college_id, applications(id)")
      .eq("firm_id", ctx.firmId)
      .eq("student_id", studentId)
      .in("college_id", collegeIds as string[]);
    for (const row of listRows ?? []) {
      const apps = (row as { applications?: { id: string }[] }).applications;
      listRowByCollege.set(row.college_id as string, {
        id: row.id,
        appId: apps?.[0]?.id ?? null,
      });
    }
  }

  let created = 0;
  for (const prompt of prompts) {
    const link = prompt.college_id
      ? listRowByCollege.get(prompt.college_id)
      : undefined;
    const { data: draft, error } = await db
      .from("essay_drafts")
      .insert({
        firm_id: ctx.firmId,
        student_id: studentId,
        title: prompt.title,
        essay_type: prompt.essay_type || "supplemental",
        prompt_text: prompt.prompt_text,
        body: "",
        word_count_target: prompt.word_limit,
        status: "draft",
        // Explicit audience decision: bulk-created supplements are for the
        // student to write — always shared.
        visibility_scope: "student",
        student_college_id: link?.id ?? null,
        application_id: link?.appId ?? null,
        current_version_number: 1,
        created_by_user_id: ctx.dbUserId,
        updated_by_user_id: ctx.dbUserId,
      })
      .select("id")
      .single();
    if (!error && draft) {
      created++;
      await db.from("essay_draft_versions").insert({
        essay_draft_id: draft.id,
        version_number: 1,
        body: "",
        commentary: null,
        created_by_user_id: ctx.dbUserId,
      });
    }
  }

  revalidatePath("/essays");
  revalidatePath("/student-essays");
  return { success: true, created };
}
