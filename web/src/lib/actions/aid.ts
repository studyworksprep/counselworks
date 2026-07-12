"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  AuthorizationError,
  requireStaff,
  requireStudentAccess,
} from "../auth/authorize";
import { AID_KIND_VALUES } from "../constants/aid";

/**
 * Scholarship / aid award tracking (fix plan 10.6). Awards hang off an
 * application; amounts are annual whole USD. Award data is family-visible by
 * design (it is the family's own financial information) — the portal queries
 * scope to the caller's student/family.
 */

async function requireApplication(applicationId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" as const };
  const db = getDb();
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" as const };
  }
  const { data: app } = await db
    .from("applications")
    .select("id, student_id")
    .eq("id", applicationId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!app) return { error: "Application not found" as const };
  try {
    await requireStudentAccess(db, ctx, app.student_id);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Application not found" as const };
    }
    throw e;
  }
  return { ctx, db, app };
}

export async function addAidAward(applicationId: string, formData: FormData) {
  const resolved = await requireApplication(applicationId);
  if ("error" in resolved) return resolved;
  const { ctx, db, app } = resolved;

  const kind = (formData.get("kind") as string) || "";
  const name = (formData.get("name") as string)?.trim();
  const amountRaw = (formData.get("annual_amount") as string) || "";
  const amount = Math.round(Number(amountRaw.replace(/[$,\s]/g, "")));
  const renewable = formData.get("renewable") === "on";
  const notes = ((formData.get("notes") as string) || "").trim() || null;

  if (!AID_KIND_VALUES.has(kind)) return { error: "Choose an award type" };
  if (!name) return { error: "Name is required" };
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "Enter a valid annual amount" };
  }

  const { error } = await db.from("aid_awards").insert({
    firm_id: ctx.firmId,
    application_id: applicationId,
    student_id: app.student_id,
    kind,
    name,
    annual_amount: amount,
    renewable,
    notes,
    created_by_user_id: ctx.dbUserId,
  });
  if (error) return { error: "Failed to save award" };

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/students/${app.student_id}/colleges`);
  revalidatePath("/family-applications");
  revalidatePath("/student-applications");
  return { success: true };
}

export async function deleteAidAward(awardId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }
  const db = getDb();
  const { data: award } = await db
    .from("aid_awards")
    .select("id, application_id, student_id")
    .eq("id", awardId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!award) return { error: "Award not found" };
  try {
    await requireStudentAccess(db, ctx, award.student_id);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Award not found" };
    throw e;
  }

  const { error } = await db
    .from("aid_awards")
    .delete()
    .eq("id", awardId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to delete award" };

  revalidatePath(`/applications/${award.application_id}`);
  revalidatePath(`/students/${award.student_id}/colleges`);
  revalidatePath("/family-applications");
  revalidatePath("/student-applications");
  return { success: true };
}

/** Record the award letter's cost of attendance on the application. */
export async function setApplicationCost(
  applicationId: string,
  formData: FormData
) {
  const resolved = await requireApplication(applicationId);
  if ("error" in resolved) return resolved;
  const { ctx, db, app } = resolved;

  const raw = ((formData.get("cost_of_attendance") as string) || "").trim();
  let cost: number | null = null;
  if (raw !== "") {
    cost = Math.round(Number(raw.replace(/[$,\s]/g, "")));
    if (!Number.isFinite(cost) || cost < 0) {
      return { error: "Enter a valid cost of attendance" };
    }
  }

  const { error } = await db
    .from("applications")
    .update({ cost_of_attendance: cost, updated_by_user_id: ctx.dbUserId })
    .eq("id", applicationId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to save cost" };

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/students/${app.student_id}/colleges`);
  revalidatePath("/family-applications");
  return { success: true };
}
