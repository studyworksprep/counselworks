"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { inngest } from "../queue/inngest";

export async function createApplication(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const studentId = formData.get("student_id") as string;
  const collegeId = formData.get("college_id") as string;
  const applicationType = formData.get("application_type") as string;
  const deadlineAt = (formData.get("deadline_at") as string) || null;

  if (!studentId || !collegeId || !applicationType) {
    return { error: "Student, college, and application type are required" };
  }

  const db = createServerClient();

  // Ensure student_colleges record exists (required FK)
  const { data: existingSC } = await db
    .from("student_colleges")
    .select("id")
    .eq("student_id", studentId)
    .eq("college_id", collegeId)
    .single();

  let studentCollegeId = existingSC?.id;

  if (!studentCollegeId) {
    const { data: newSC, error: scError } = await db
      .from("student_colleges")
      .insert({
        firm_id: ctx.firmId,
        student_id: studentId,
        college_id: collegeId,
        category: "target",
        round_type: applicationType,
        status: "applying",
        created_by_user_id: ctx.dbUserId,
        updated_by_user_id: ctx.dbUserId,
      })
      .select("id")
      .single();

    if (scError || !newSC) {
      console.error("Failed to create student_college:", scError);
      return { error: "Failed to link student and college" };
    }
    studentCollegeId = newSC.id;
  }

  const { data, error } = await db
    .from("applications")
    .insert({
      firm_id: ctx.firmId,
      student_id: studentId,
      college_id: collegeId,
      student_college_id: studentCollegeId,
      application_type: applicationType,
      stage: "not_started",
      deadline_at: deadlineAt,
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create application:", error);
    return { error: "Failed to create application" };
  }

  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return { id: data.id };
}

export async function updateApplicationStage(
  applicationId: string,
  stage: string
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = createServerClient();
  const updates: Record<string, unknown> = {
    stage,
    updated_by_user_id: ctx.dbUserId,
    updated_at: new Date().toISOString(),
  };

  if (stage === "submitted") {
    updates.submitted_at = new Date().toISOString();
  }

  const { error } = await db
    .from("applications")
    .update(updates)
    .eq("id", applicationId)
    .eq("firm_id", ctx.firmId);

  if (error) {
    console.error("Failed to update application stage:", error);
    return { error: "Failed to update stage" };
  }

  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateApplicationDecision(
  applicationId: string,
  decisionResult: string
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = createServerClient();
  const { error } = await db
    .from("applications")
    .update({
      stage: "decision_received",
      decision_result: decisionResult,
      decision_at: new Date().toISOString(),
      updated_by_user_id: ctx.dbUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to record decision" };

  // Refresh reports asynchronously when a decision is recorded
  await inngest.send({
    name: "reports/refresh",
    data: { firmId: ctx.firmId },
  });

  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return { success: true };
}
