"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  AuthorizationError,
  requireStaff,
  requireStudentAccess,
} from "../auth/authorize";
import {
  TEST_TYPE_VALUES,
  SITTING_STATUS_VALUES,
} from "../constants/testing";

/**
 * Testing plan (fix plan 10.6): planned SAT/ACT/etc. sittings with
 * registration deadlines. Staff manage the plan; the student portal reads it
 * (their own sittings only) — the plan is inherently student-visible.
 */

function parseDate(value: FormDataEntryValue | null): string | null {
  const raw = ((value as string) || "").trim();
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export async function saveTestSitting(studentId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  try {
    requireStaff(ctx);
    await requireStudentAccess(db, ctx, studentId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Student not found" };
    throw e;
  }

  const sittingId = (formData.get("sitting_id") as string) || null;
  const testType = (formData.get("test_type") as string) || "";
  const status = (formData.get("status") as string) || "planned";
  const testDate = parseDate(formData.get("test_date"));
  const registrationDeadline = parseDate(
    formData.get("registration_deadline")
  );
  const score = ((formData.get("score") as string) || "").trim() || null;
  const notes = ((formData.get("notes") as string) || "").trim() || null;

  if (!TEST_TYPE_VALUES.has(testType)) return { error: "Choose a test" };
  if (!SITTING_STATUS_VALUES.has(status)) return { error: "Invalid status" };

  const values = {
    test_type: testType,
    status,
    test_date: testDate,
    registration_deadline: registrationDeadline,
    score,
    notes,
  };

  if (sittingId) {
    const { error } = await db
      .from("test_sittings")
      .update(values)
      .eq("id", sittingId)
      .eq("firm_id", ctx.firmId)
      .eq("student_id", studentId);
    if (error) return { error: "Failed to save sitting" };
  } else {
    const { error } = await db.from("test_sittings").insert({
      firm_id: ctx.firmId,
      student_id: studentId,
      ...values,
      created_by_user_id: ctx.dbUserId,
    });
    if (error) return { error: "Failed to save sitting" };
  }

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/student-profile");
  return { success: true };
}

export async function deleteTestSitting(sittingId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }
  const { data: sitting } = await db
    .from("test_sittings")
    .select("id, student_id")
    .eq("id", sittingId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!sitting) return { error: "Sitting not found" };
  try {
    await requireStudentAccess(db, ctx, sitting.student_id);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Sitting not found" };
    throw e;
  }

  const { error } = await db
    .from("test_sittings")
    .delete()
    .eq("id", sittingId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to delete sitting" };

  revalidatePath(`/students/${sitting.student_id}`);
  revalidatePath("/student-profile");
  return { success: true };
}
