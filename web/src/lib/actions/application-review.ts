"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { getApplicationFinalReview } from "../db/queries";
import { resolveUserAndFirm } from "../auth/resolve";
import { requireApplicationReviewAccess } from "../auth/application-review";
import { AuthorizationError } from "../auth/authorize";
import {
  prepareReviewSchema,
  reviewActionSchema,
  reviewSelectionSchema,
} from "../applications/final-review";
import { revalidateCollegeWorkspaces } from "../colleges/revalidate";
import { recordAuditEvent } from "../audit";

function refresh(applicationId: string) {
  for (const path of [
    `/applications/${applicationId}`,
    `/applications/${applicationId}/review`,
    `/student-applications/${applicationId}/review`,
    `/family-applications/${applicationId}/review`,
    "/student-applications",
    "/family-applications",
    "/student-readiness",
    "/family-readiness",
    "/caseload",
  ])
    revalidatePath(path);
  revalidateCollegeWorkspaces();
}

export async function previewApplicationReview(input: unknown) {
  const parsed = reviewSelectionSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Check your application and essay selection" };
  try {
    const data = await getApplicationFinalReview(
      parsed.data.applicationId,
      parsed.data.generalEssayIds,
    );
    if (!data || data.surface === "family")
      return { error: "Final review is not available" };
    return { data };
  } catch {
    return {
      error:
        "Unable to refresh the review. Check your essay selection and try again.",
    };
  }
}

function reviewError(message: string) {
  // The guarded database functions return deliberately user-facing messages.
  const safe = [
    "Application not found",
    "Choose an available general essay",
    "The application changed",
    "This application has already",
    "Packet changed in another window",
    "This packet is outdated",
    "Resolve the final review checks",
    "Approve the packet and share",
    "Use the latest packet",
    "The student must confirm",
    "A recorded submission",
    "Ask your counselor",
  ];
  return safe.some((prefix) => message.startsWith(prefix))
    ? message
    : "Unable to save the review. Refresh and try again.";
}

export async function prepareApplicationPacket(input: unknown) {
  const parsed = prepareReviewSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Refresh the review before preparing a packet" };
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  try {
    const app = await requireApplicationReviewAccess(
      db,
      ctx,
      parsed.data.applicationId,
      true,
    );
    const result = await db
      .from("application_review_packets")
      .insert({
        firm_id: ctx.firmId,
        student_id: app.student_id,
        application_id: app.id,
        fingerprint: parsed.data.fingerprint,
        manifest: { generalEssayIds: parsed.data.generalEssayIds },
        created_by_user_id: ctx.dbUserId,
        updated_by_user_id: ctx.dbUserId,
      })
      .select("id,number")
      .single();
    if (result.error) return { error: reviewError(result.error.message) };
    await recordAuditEvent(db, {
      firmId: ctx.firmId,
      actorUserId: ctx.dbUserId,
      entityType: "application",
      entityId: app.id,
      actionType: "application_packet_prepared",
      label: `Application review packet ${result.data.number} prepared`,
      metadata: { packetId: result.data.id },
    });
    refresh(app.id);
    return { success: true, packetId: result.data.id as string };
  } catch (error) {
    return {
      error:
        error instanceof AuthorizationError
          ? "Application not found"
          : "Unable to prepare the packet",
    };
  }
}

export async function updateApplicationPacket(input: unknown) {
  const parsed = reviewActionSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Review the confirmation and submission details" };
  const p = parsed.data,
    ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  try {
    const app = await requireApplicationReviewAccess(
      db,
      ctx,
      p.applicationId,
      true,
    );
    const packet = await db
      .from("application_review_packets")
      .select("id,manifest,number")
      .eq("firm_id", ctx.firmId)
      .eq("student_id", app.student_id)
      .eq("application_id", app.id)
      .eq("id", p.packetId)
      .maybeSingle();
    if (packet.error || !packet.data) return { error: "Packet not found" };
    if (ctx.role === "student") {
      const access = await db.rpc("application_packet_visible", {
        p_firm: ctx.firmId,
        p_student: app.student_id,
        p_manifest: packet.data.manifest,
        p_family: false,
      });
      if (access.error || !access.data) return { error: "Packet not found" };
    }
    if (p.action === "submit" && (!p.submittedOn || !p.platform))
      return { error: "Enter the submission date and application platform" };
    const result = await db.rpc("update_application_packet", {
      p_firm: ctx.firmId,
      p_actor: ctx.dbUserId,
      p_packet: p.packetId,
      p_revision: p.revision,
      p_action: p.action,
      p_submitted_on: p.submittedOn ?? null,
      p_platform: p.platform ?? null,
      p_confirmation: p.confirmation ?? null,
    });
    if (result.error) return { error: reviewError(result.error.message) };
    const labels = {
      approve_student: "Student approved",
      approve_counselor: "Counselor approved",
      withdraw_student: "Student withdrew approval of",
      withdraw_counselor: "Counselor withdrew approval of",
      share: "Student shared",
      unshare: "Student stopped parent sharing of",
      submit: "Student recorded submission of",
    };
    await recordAuditEvent(db, {
      firmId: ctx.firmId,
      actorUserId: ctx.dbUserId,
      entityType: "application",
      entityId: app.id,
      actionType: `application_packet_${p.action}`,
      label: `${labels[p.action]} application packet ${packet.data.number}`,
      metadata: { packetId: packet.data.id },
    });
    refresh(app.id);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof AuthorizationError
          ? "Application not found"
          : "Unable to save the review",
    };
  }
}
