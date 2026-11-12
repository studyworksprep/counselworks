"use server";
import { dateOnly } from "../workflows/plan";
import { z } from "zod";
import { revalidateCollegeWorkspaces } from "../colleges/revalidate";

import { resolveTaskOwner } from "../auth/task-owner";
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
  const round = formData.get("application_type") as string;
  const explicitDeadline = (formData.get("deadline_at") as string) || null;
  if (!z.uuid().safeParse(studentId).success || !z.uuid().safeParse(collegeId).success || !ROUND_VALUES.has(round)) {
    return { error: "Student, college, and a valid application round are required" };
  }
  if (explicitDeadline && !Number.isFinite(Date.parse(explicitDeadline))) return { error: "Invalid deadline" };
  const db = getDb();
  try {
    requireStaff(ctx);
    await requireStudentAccess(db, ctx, studentId);
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "Student not found" };
    throw error;
  }
  const deadline = explicitDeadline || await resolveAnchoredDeadline(db, ctx.firmId, studentId, round);
  const { data, error } = await db.rpc("create_student_application", {
    p_firm: ctx.firmId, p_actor: ctx.dbUserId, p_student: studentId, p_catalog: collegeId,
    p_round: round, p_deadline: deadline, p_source: explicitDeadline ? "explicit" : "estimate",
    p_checklist: buildDefaultChecklist({ round }),
  });
  if (error || !data?.id) {
    console.error("Failed to create application:", error);
    return { error: "Failed to create application" };
  }
  if (data.created) await recordAuditEvent(db, {
    firmId: ctx.firmId, actorUserId: ctx.dbUserId, entityType: "application", entityId: data.id,
    actionType: "application_created", label: `Application created (${round.toUpperCase()})`,
  });
  revalidateCollegeWorkspaces();
  revalidatePath("/dashboard");
  return { id: data.id as string };
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

  revalidateCollegeWorkspaces();
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
    const owner = await resolveTaskOwner(db, { firmId: ctx.firmId, studentId: app.student_id,
      actingUserId: ctx.dbUserId, role: "student" });
    const followUp = await db.from("tasks").insert({
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
      assigned_user_id: owner.userId,
      owner_role: owner.role,
      owner_pending: !owner.ready,
      student_id: app.student_id,
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    });
    if (followUp.error) return { error: "Decision saved, but follow-up task creation failed" };
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

  revalidateCollegeWorkspaces();
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/dashboard");
  // Decision badges render on the portal college and application lists
  // (rule 2 — golden-path step 11 asserts them in both portals).
  revalidatePath("/student-colleges");
  revalidatePath("/family-colleges");
  revalidatePath("/student-applications");
  revalidatePath("/family-applications");
  return { success: true };
}

export async function previewApplicationSchedule(applicationId:string,form:FormData) {
  const ctx=await resolveUserAndFirm();if(!ctx) return {error:"Not authenticated"};const db=getDb();
  try {await requireApplicationAccess(db,ctx,applicationId);} catch {return {error:"Application not found"};}
  const deadline=String(form.get("deadline_at") || "") || null;const round=String(form.get("application_type") || "");
  if((deadline && !dateOnly.safeParse(deadline).success) || !ROUND_VALUES.has(round)) return {error:"Invalid deadline or round"};
  const {data,error}=await db.rpc("preview_application_schedule",{p_firm:ctx.firmId,p_actor:ctx.dbUserId,p_application:applicationId,p_deadline:deadline,p_round:round});
  return error ? {error:error.message} : {preview:data as {application_updated_at:string;deadline:string|null;round:string;changes:{id:string;title:string;old_date:string|null;new_date:string|null}[]}};
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

  if(deadlineAt && !dateOnly.safeParse(deadlineAt).success) return {error:"Invalid deadline"};
  let expected: unknown;
  try {expected=JSON.parse(String(formData.get("schedule_preview")));} catch {return {error:"Preview the schedule before saving"};}
  if(!expected) return {error:"Preview the schedule before saving"};
  const {error}=await db.rpc("update_application_schedule",{p_firm:ctx.firmId,p_actor:ctx.dbUserId,p_application:applicationId,
    p_deadline:deadlineAt,p_round:applicationType,p_aid:financialAidRequired,p_expected:expected});
  if(error) return {error:error.message};
  for(const path of ["/students","/tasks","/student-tasks","/family-tasks","/student-workflows","/family-workflows","/student-dashboard","/family-dashboard","/student-applications","/family-applications"]) revalidatePath(path,"layout");


  revalidatePath(`/applications/${applicationId}`);
  revalidateCollegeWorkspaces();
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
  revalidateCollegeWorkspaces();
  revalidatePath("/applications");
  return { success: true };
}

/**
 * Promotes a student_colleges row into an application. Counselors call this
 * from the student's college list rather than re-entering student/college on
 * /applications/new.
 *
 * Idempotent — if an application already exists for this list row, returns
 * the existing application id without changing its round, deadline or list
 * status. New creation and list promotion happen in one database transaction.
 */
export async function createApplicationFromList(
  studentCollegeId: string,
): Promise<{ error: string } | { id: string; created: boolean }> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!z.uuid().safeParse(studentCollegeId).success) return { error: "College not found" };
  const db = getDb();
  const { data: sc, error: readError } = await db.from("student_colleges")
    .select("id, student_id, round_type").eq("id", studentCollegeId).eq("firm_id", ctx.firmId).maybeSingle();
  if (readError || !sc) return { error: "College not found" };
  try {
    requireStaff(ctx);
    await requireStudentAccess(db, ctx, sc.student_id);
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "College not found" };
    throw error;
  }
  const round = sc.round_type ?? "rd";
  if (!ROUND_VALUES.has(round)) return { error: "Choose a valid application round first" };
  const deadline = await resolveAnchoredDeadline(db, ctx.firmId, sc.student_id, round);
  const { data, error } = await db.rpc("create_college_application", {
    p_firm: ctx.firmId, p_actor: ctx.dbUserId, p_college: studentCollegeId,
    p_round: round, p_deadline: deadline, p_source: "estimate",
    p_checklist: buildDefaultChecklist({ round }),
  });
  if (error || !data?.id) {
    console.error("Failed to create application from list:", error);
    return { error: "Failed to create application" };
  }
  if (data.created) await recordAuditEvent(db, {
    firmId: ctx.firmId, actorUserId: ctx.dbUserId, entityType: "application", entityId: data.id,
    actionType: "application_created", label: `Application created (${round.toUpperCase()})`,
  });
  revalidateCollegeWorkspaces();
  revalidatePath("/dashboard");
  return { id: data.id as string, created: Boolean(data.created) };
}
