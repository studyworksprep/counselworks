"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";

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
      visibility_scope: (formData.get("visibility_scope") as string) || "staff",
      application_id: (formData.get("application_id") as string) || null,
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

  // Get current version number
  const { data: draft } = await db
    .from("essay_drafts")
    .select("current_version_number")
    .eq("id", essayId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!draft) return { error: "Essay draft not found" };

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
  return { success: true, version: nextVersion };
}

export async function updateEssayStatus(essayId: string, status: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
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
