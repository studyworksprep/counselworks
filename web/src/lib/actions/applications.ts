"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { recordAuditEvent } from "../audit";
import {
  AuthorizationError,
  requireStaff,
  requireStudentAccess,
} from "../auth/authorize";
import {
  ROUND_VALUES,
  DECISION_VALUES,
  KANBAN_SETTABLE_STAGE_VALUES,
  buildDefaultChecklist,
  parseChecklist,
  anchorDeadline,
  parseRoundAnchorOverrides,
  type ChecklistItem,
} from "../constants/applications";

/**
 * Round → deadline anchoring (fix plan 8.7): when a creation path has no
 * explicit deadline, derive one from the round and the student's class year
 * (with firm-level month/day overrides). Editable on the detail page.
 */
async function resolveAnchoredDeadline(
  db: ReturnType<typeof getDb>,
  firmId: string,
  studentId: string,
  round: string | null
): Promise<string | null> {
  const [{ data: student }, { data: settings }] = await Promise.all([
    db
      .from("students")
      .select("graduation_year")
      .eq("id", studentId)
      .eq("firm_id", firmId)
      .maybeSingle(),
    db
      .from("firm_settings")
      .select("round_deadline_defaults_json")
      .eq("firm_id", firmId)
      .maybeSingle(),
  ]);
  return anchorDeadline(
    round,
    student?.graduation_year ?? null,
    parseRoundAnchorOverrides(settings?.round_deadline_defaults_json)
  );
}

/** Staff-only + assigned-student guard for application mutations. */
async function requireApplicationAccess(
  db: ReturnType<typeof getDb>,
  ctx: NonNullable<Awaited<ReturnType<typeof resolveUserAndFirm>>>,
  applicationId: string
) {
  requireStaff(ctx);
  const { data: app } = await db
    .from("applications")
    .select(
      "id, student_id, student_college_id, application_type, financial_aid_required, checklist_json, stage"
    )
    .eq("id", applicationId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!app) throw new AuthorizationError("Application not found");
  await requireStudentAccess(db, ctx, app.student_id);
  return app;
}

export async function createApplication(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const studentId = formData.get("student_id") as string;
  const collegeId = formData.get("college_id") as string;
  const applicationType = formData.get("application_type") as string;
  let deadlineAt = (formData.get("deadline_at") as string) || null;

  if (!studentId || !collegeId || !applicationType) {
    return { error: "Student, college, and application type are required" };
  }
  if (!ROUND_VALUES.has(applicationType)) {
    return { error: "Invalid application round" };
  }

  const db = getDb();
  if (!deadlineAt) {
    deadlineAt = await resolveAnchoredDeadline(
      db,
      ctx.firmId,
      studentId,
      applicationType
    );
  }
  try {
    requireStaff(ctx);
    await requireStudentAccess(db, ctx, studentId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Student not found" };
    throw e;
  }

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
      checklist_json: buildDefaultChecklist({ round: applicationType }),
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create application:", error);
    return { error: "Failed to create application" };
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "application",
    entityId: data.id,
    actionType: "application_created",
    label: `Application created (${applicationType.toUpperCase()})`,
  });

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

  // Shared enum only; "decision_received" is reachable exclusively through
  // updateApplicationDecision, which also records the result and syncs the
  // college-list row (fix plan 7.6).
  if (!KANBAN_SETTABLE_STAGE_VALUES.has(stage)) {
    return {
      error:
        stage === "decision_received"
          ? "Use Record Decision to enter a decision"
          : "Invalid application stage",
    };
  }

  const db = getDb();
  try {
    await requireApplicationAccess(db, ctx, applicationId);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Application not found" };
    }
    throw e;
  }
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
  decisionResult: string,
  options?: {
    decisionDate?: string;
    depositStatus?: string;
    createFollowUpTask?: boolean;
  }
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!DECISION_VALUES.has(decisionResult)) {
    return { error: "Invalid decision" };
  }

  const db = getDb();
  let app;
  try {
    app = await requireApplicationAccess(db, ctx, applicationId);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Application not found" };
    }
    throw e;
  }

  const decisionAt = options?.decisionDate
    ? new Date(options.decisionDate).toISOString()
    : new Date().toISOString();

  const { error } = await db
    .from("applications")
    .update({
      stage: "decision_received",
      decision_result: decisionResult,
      decision_at: decisionAt,
      updated_by_user_id: ctx.dbUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to record decision" };

  // Keep the college-list row in sync so list views and portals agree.
  const listUpdates: Record<string, unknown> = {
    decision_result: decisionResult,
    updated_by_user_id: ctx.dbUserId,
    updated_at: new Date().toISOString(),
  };
  if (decisionResult === "accepted" && options?.depositStatus) {
    listUpdates.deposit_status = options.depositStatus;
  }
  await db
    .from("student_colleges")
    .update(listUpdates)
    .eq("id", app.student_college_id)
    .eq("firm_id", ctx.firmId);

  // Waitlist/deferral follow-up (LOCI) as a lightweight task.
  if (
    options?.createFollowUpTask &&
    (decisionResult === "waitlisted" || decisionResult === "deferred")
  ) {
    const { data: college } = await db
      .from("applications")
      .select("colleges:college_id(name)")
      .eq("id", applicationId)
      .single();
    const collegeName =
      (college?.colleges as unknown as { name: string } | null)?.name ??
      "this college";
    await db.from("tasks").insert({
      firm_id: ctx.firmId,
      title: `Letter of continued interest — ${collegeName}`,
      description:
        decisionResult === "waitlisted"
          ? "Waitlisted: draft and send a letter of continued interest, and confirm the waitlist spot."
          : "Deferred: send an update letter with new grades/achievements before the RD review.",
      task_type: "follow_up",
      priority: "high",
      status: "pending",
      // Family-visible: the student writes the LOCI with counselor guidance.
      visibility_scope: "family",
      assigned_user_id: ctx.dbUserId,
      student_id: app.student_id,
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    });
    revalidatePath("/tasks");
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "application",
    entityId: applicationId,
    actionType: "decision_recorded",
    label: `Decision recorded: ${decisionResult}`,
  });

  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

/** Edit deadline and round after creation (application detail page). */
export async function updateApplicationDetails(
  applicationId: string,
  formData: FormData
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  try {
    await requireApplicationAccess(db, ctx, applicationId);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Application not found" };
    }
    throw e;
  }

  const applicationType = (formData.get("application_type") as string) || "";
  if (!ROUND_VALUES.has(applicationType)) {
    return { error: "Invalid application round" };
  }
  const deadlineAt = (formData.get("deadline_at") as string) || null;
  const financialAidRequired = formData.get("financial_aid_required") === "on";

  const { error } = await db
    .from("applications")
    .update({
      application_type: applicationType,
      deadline_at: deadlineAt,
      financial_aid_required: financialAidRequired,
      updated_by_user_id: ctx.dbUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to update application" };

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications");
  revalidatePath("/calendar");
  return { success: true };
}

/**
 * Batched checklist write (fix plan 8.10): the client toggles optimistically
 * and flushes the whole list once, instead of one blocking round-trip per
 * checkbox. The payload is re-parsed through the shared validator so only
 * well-formed items land.
 */
export async function updateApplicationChecklist(
  applicationId: string,
  items: ChecklistItem[]
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const parsed = parseChecklist(items);
  if (!parsed) return { error: "Invalid checklist" };

  const db = getDb();
  try {
    await requireApplicationAccess(db, ctx, applicationId);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Application not found" };
    }
    throw e;
  }

  const { error } = await db
    .from("applications")
    .update({
      checklist_json: parsed,
      updated_by_user_id: ctx.dbUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to update checklist" };

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications");
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
  const anchoredDeadline = await resolveAnchoredDeadline(
    db,
    ctx.firmId,
    sc.student_id,
    applicationType
  );
  const { data: created, error: insertError } = await db
    .from("applications")
    .insert({
      firm_id: ctx.firmId,
      student_id: sc.student_id,
      college_id: sc.college_id,
      student_college_id: sc.id,
      application_type: applicationType,
      stage: "not_started",
      deadline_at: anchoredDeadline,
      checklist_json: buildDefaultChecklist({ round: applicationType }),
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

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "application",
    entityId: created.id as string,
    actionType: "application_created",
    label: `Application created (${applicationType.toUpperCase()})`,
  });

  revalidatePath(`/students/${sc.student_id}/colleges`);
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return { id: created.id as string, created: true };
}
