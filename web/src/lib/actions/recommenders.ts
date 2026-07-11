"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  AuthorizationError,
  requireStaff,
  requireStudentAccess,
} from "../auth/authorize";

const STATUS_SET = new Set<string>([
  "identified",
  "asked",
  "accepted",
  "submitted",
  "declined",
]);

export async function createRecommender(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const studentId = (formData.get("student_id") as string) || "";
  const name = ((formData.get("name") as string) || "").trim();
  if (!name) return { error: "Name is required" };

  const db = getDb();
  try {
    requireStaff(ctx);
    await requireStudentAccess(db, ctx, studentId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Student not found" };
    throw e;
  }

  const { error } = await db.from("recommenders").insert({
    firm_id: ctx.firmId,
    student_id: studentId,
    name,
    role_title: ((formData.get("role_title") as string) || "").trim() || null,
    email: ((formData.get("email") as string) || "").trim() || null,
    status: "identified",
    notes: ((formData.get("notes") as string) || "").trim() || null,
    created_by_user_id: ctx.dbUserId,
    updated_by_user_id: ctx.dbUserId,
  });
  if (error) {
    console.error("Failed to create recommender:", error);
    return { error: "Failed to add recommender" };
  }

  revalidatePath(`/students/${studentId}`);
  return { success: true };
}

export async function updateRecommenderStatus(
  recommenderId: string,
  status: string
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!STATUS_SET.has(status)) return { error: "Invalid status" };

  const db = getDb();
  const { data: rec } = await db
    .from("recommenders")
    .select("id, student_id")
    .eq("id", recommenderId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!rec) return { error: "Recommender not found" };
  try {
    requireStaff(ctx);
    await requireStudentAccess(db, ctx, rec.student_id);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Recommender not found" };
    }
    throw e;
  }

  const { error } = await db
    .from("recommenders")
    .update({ status, updated_by_user_id: ctx.dbUserId })
    .eq("id", recommenderId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to update status" };

  revalidatePath(`/students/${rec.student_id}`);
  return { success: true };
}

export async function deleteRecommender(recommenderId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  const { data: rec } = await db
    .from("recommenders")
    .select("id, student_id")
    .eq("id", recommenderId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!rec) return { error: "Recommender not found" };
  try {
    requireStaff(ctx);
    await requireStudentAccess(db, ctx, rec.student_id);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Recommender not found" };
    }
    throw e;
  }

  const { error } = await db
    .from("recommenders")
    .delete()
    .eq("id", recommenderId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to remove recommender" };

  revalidatePath(`/students/${rec.student_id}`);
  return { success: true };
}
