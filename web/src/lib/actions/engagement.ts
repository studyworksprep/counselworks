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
  INTERVIEW_STATUS_VALUES,
  ENGAGEMENT_TYPE_VALUES,
  parseEngagementLog,
} from "../constants/engagement";

/**
 * Engagement tracking on the student-college row (fix plan 10.9):
 * interview status/date + a demonstrated-interest log. Staff-managed; the
 * student portal reads its own rows (the log is the student's own activity,
 * inherently student-visible).
 */

async function requireListRow(studentCollegeId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" as const };
  const db = getDb();
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" as const };
  }
  const { data: row } = await db
    .from("student_colleges")
    .select("id, student_id, engagement_log_json")
    .eq("id", studentCollegeId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!row) return { error: "College not found" as const };
  try {
    await requireStudentAccess(db, ctx, row.student_id);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "College not found" as const };
    }
    throw e;
  }
  return { ctx, db, row };
}

function revalidate(studentId: string) {
  revalidatePath(`/students/${studentId}/colleges`);
  revalidatePath("/student-colleges");
}

/** Interview status + date. Empty status clears both. */
export async function updateInterview(
  studentCollegeId: string,
  formData: FormData
) {
  const resolved = await requireListRow(studentCollegeId);
  if ("error" in resolved) return resolved;
  const { ctx, db, row } = resolved;

  const status = ((formData.get("interview_status") as string) || "").trim();
  const dateRaw = ((formData.get("interview_at") as string) || "").trim();
  if (status && !INTERVIEW_STATUS_VALUES.has(status)) {
    return { error: "Invalid interview status" };
  }
  if (dateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return { error: "Invalid interview date" };
  }

  const { error } = await db
    .from("student_colleges")
    .update({
      interview_status: status || null,
      interview_at: status ? dateRaw || null : null,
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", studentCollegeId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to save interview" };

  revalidate(row.student_id);
  return { success: true };
}

export async function addEngagementEntry(
  studentCollegeId: string,
  formData: FormData
) {
  const resolved = await requireListRow(studentCollegeId);
  if ("error" in resolved) return resolved;
  const { ctx, db, row } = resolved;

  const type = (formData.get("type") as string) || "";
  const date = ((formData.get("date") as string) || "").trim() || null;
  const note = ((formData.get("note") as string) || "").trim() || null;
  if (!ENGAGEMENT_TYPE_VALUES.has(type)) {
    return { error: "Choose an activity type" };
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Invalid date" };
  }

  const log = parseEngagementLog(row.engagement_log_json);
  log.push({ type, date, note });

  const { error } = await db
    .from("student_colleges")
    .update({
      engagement_log_json: log,
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", studentCollegeId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to log activity" };

  revalidate(row.student_id);
  return { log };
}

export async function removeEngagementEntry(
  studentCollegeId: string,
  index: number
) {
  const resolved = await requireListRow(studentCollegeId);
  if ("error" in resolved) return resolved;
  const { ctx, db, row } = resolved;

  const log = parseEngagementLog(row.engagement_log_json);
  if (!Number.isInteger(index) || index < 0 || index >= log.length) {
    return { error: "Entry not found" };
  }
  log.splice(index, 1);

  const { error } = await db
    .from("student_colleges")
    .update({
      engagement_log_json: log,
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", studentCollegeId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to remove entry" };

  revalidate(row.student_id);
  return { log };
}
