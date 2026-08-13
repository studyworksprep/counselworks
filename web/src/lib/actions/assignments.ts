"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { hasPermission } from "@/modules/permissions/service";

const ASSIGNMENT_TYPES = new Set([
  "counselor",
  "essay_coach",
  "tutor",
  "read_only_staff",
]);

interface AuthCtx {
  userId: string;
  dbUserId: string;
  firmId: string;
  role: string;
}

type StaffAuthResult = { ok: true; ctx: AuthCtx } | { ok: false; error: string };

async function requireManageStaff(): Promise<StaffAuthResult> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { ok: false, error: "Not authenticated" };
  const allowed = hasPermission(
    {
      userId: ctx.userId,
      firmId: ctx.firmId,
      role: ctx.role,
      assignedStudentIds: [],
    },
    "manage_staff",
  );
  if (!allowed) return { ok: false, error: "Not authorized" };
  return { ok: true, ctx };
}

export async function assignStaffToStudent(formData: FormData) {
  const auth = await requireManageStaff();
  if (!auth.ok) return { error: auth.error };
  const { ctx } = auth;

  const studentId = formData.get("student_id") as string;
  const userId = formData.get("user_id") as string;
  const assignmentType = (formData.get("assignment_type") as string) ?? "counselor";
  const isPrimary = formData.get("is_primary") === "true";

  if (!studentId || !userId) return { error: "Student and staff are required" };
  if (!ASSIGNMENT_TYPES.has(assignmentType)) {
    return { error: "Invalid assignment type" };
  }

  const db = getDb();

  // Tenant guards.
  const { data: student } = await db
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("firm_id", ctx.firmId)
    .single();
  if (!student) return { error: "Student not found" };

  const { data: membership } = await db
    .from("firm_memberships")
    .select("user_id")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return { error: "Staff member not found in this firm" };

  // If marking as primary for this assignment_type, demote any existing
  // primary on the same (student, assignment_type) so there's only one.
  if (isPrimary) {
    await db
      .from("student_staff_assignments")
      .update({ is_primary: false })
      .eq("firm_id", ctx.firmId)
      .eq("student_id", studentId)
      .eq("assignment_type", assignmentType)
      .eq("is_primary", true);
  }

  const { error } = await db
    .from("student_staff_assignments")
    .insert({
      firm_id: ctx.firmId,
      student_id: studentId,
      user_id: userId,
      assignment_type: assignmentType,
      is_primary: isPrimary,
    });

  if (error) {
    if (error.code === "23505") {
      return { error: "That staff member is already assigned in this role" };
    }
    console.error("Failed to assign staff:", error);
    return { error: "Failed to assign staff" };
  }

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
  revalidatePath("/families");
  return { success: true };
}

export async function removeStaffAssignment(assignmentId: string) {
  const auth = await requireManageStaff();
  if (!auth.ok) return { error: auth.error };
  const { ctx } = auth;

  const db = getDb();

  const { data: existing } = await db
    .from("student_staff_assignments")
    .select("id, student_id")
    .eq("id", assignmentId)
    .eq("firm_id", ctx.firmId)
    .single();
  if (!existing) return { error: "Assignment not found" };

  const { error } = await db
    .from("student_staff_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("firm_id", ctx.firmId);

  if (error) {
    console.error("Failed to remove assignment:", error);
    return { error: "Failed to remove assignment" };
  }

  revalidatePath(`/students/${existing.student_id}`);
  revalidatePath("/students");
  revalidatePath("/families");
  return { success: true };
}
