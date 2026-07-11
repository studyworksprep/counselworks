"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
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

  const db = getDb();

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

  const db = getDb();
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

  const db = getDb();
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

/**
 * Promotes a student_colleges row into an application. Counselors call this
 * from the student's college list rather than re-entering student/college on
 * /applications/new.
 *
 * Idempotent — if an application already exists for this list row, returns
 * the existing application id and does NOT create a duplicate. Either way,
 * sets the parent student_colleges.status to 'applying' so the list reflects
 * that the student is actively pursuing this school.
 */
export async function createApplicationFromList(
  studentCollegeId: string,
): Promise<{ error: string } | { id: string; created: boolean }> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();

  const { data: sc } = await db
    .from("student_colleges")
    .select("id, student_id, college_id, round_type, status")
    .eq("id", studentCollegeId)
    .eq("firm_id", ctx.firmId)
    .single();
  if (!sc) return { error: "Not found" };

  const { data: existingApp } = await db
    .from("applications")
    .select("id")
    .eq("firm_id", ctx.firmId)
    .eq("student_college_id", sc.id)
    .limit(1)
    .maybeSingle();

  if (existingApp) {
    if (sc.status !== "applying" && sc.status !== "applied") {
      await db
        .from("student_colleges")
        .update({
          status: "applying",
          updated_by_user_id: ctx.dbUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sc.id)
        .eq("firm_id", ctx.firmId);
    }
    revalidatePath(`/students/${sc.student_id}/colleges`);
    revalidatePath("/applications");
    return { id: existingApp.id as string, created: false };
  }

  const applicationType = (sc.round_type as string | null) ?? "rd";
  const { data: created, error: insertError } = await db
    .from("applications")
    .insert({
      firm_id: ctx.firmId,
      student_id: sc.student_id,
      college_id: sc.college_id,
      student_college_id: sc.id,
      application_type: applicationType,
      stage: "not_started",
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    console.error("Failed to create application from list:", insertError);
    return { error: "Failed to create application" };
  }

  await db
    .from("student_colleges")
    .update({
      status: "applying",
      updated_by_user_id: ctx.dbUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sc.id)
    .eq("firm_id", ctx.firmId);

  revalidatePath(`/students/${sc.student_id}/colleges`);
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return { id: created.id as string, created: true };
}
