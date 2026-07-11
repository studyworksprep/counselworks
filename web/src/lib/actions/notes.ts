"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  AuthorizationError,
  requireFamilyAccess,
  requireStaff,
  requireStudentAccess,
} from "../auth/authorize";

const NOTE_VISIBILITY = new Set(["staff", "family"]);

/**
 * General notes on a student or family. Staff-only creation; the form's
 * visibility control decides the audience ("staff" = private to the firm,
 * "family" = shown in the student and family portals).
 */
export async function createNote(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const body = ((formData.get("body") as string) || "").trim();
  if (!body) return { error: "Note text is required" };

  const visibility = (formData.get("visibility_scope") as string) || "staff";
  if (!NOTE_VISIBILITY.has(visibility)) {
    return { error: "Invalid visibility" };
  }

  const studentId = (formData.get("student_id") as string) || null;
  const familyId = (formData.get("family_id") as string) || null;
  if (!studentId && !familyId) {
    return { error: "Note must be linked to a student or family" };
  }

  const db = getDb();
  try {
    if (studentId) await requireStudentAccess(db, ctx, studentId);
    if (familyId) await requireFamilyAccess(db, ctx, familyId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Not authorized" };
    throw e;
  }

  const { error } = await db.from("notes").insert({
    firm_id: ctx.firmId,
    student_id: studentId,
    family_id: familyId,
    note_type: "general",
    visibility_scope: visibility,
    title: ((formData.get("title") as string) || "").trim() || null,
    body,
    created_by_user_id: ctx.dbUserId,
    updated_by_user_id: ctx.dbUserId,
  });

  if (error) {
    console.error("Failed to create note:", error);
    return { error: "Failed to create note" };
  }

  if (studentId) revalidatePath(`/students/${studentId}`);
  if (familyId) revalidatePath(`/families/${familyId}`);
  return { success: true };
}

export async function archiveNote(noteId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const db = getDb();
  const { data: note } = await db
    .from("notes")
    .select("id, student_id, family_id")
    .eq("id", noteId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!note) return { error: "Note not found" };

  try {
    if (note.student_id) await requireStudentAccess(db, ctx, note.student_id);
    else if (note.family_id) await requireFamilyAccess(db, ctx, note.family_id);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Not authorized" };
    throw e;
  }

  const { error } = await db
    .from("notes")
    .update({
      archived_at: new Date().toISOString(),
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", noteId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to archive note" };

  if (note.student_id) revalidatePath(`/students/${note.student_id}`);
  if (note.family_id) revalidatePath(`/families/${note.family_id}`);
  return { success: true };
}
