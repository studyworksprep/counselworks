import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AuthorizationError,
  resolveStudentRelationship,
  type ActorContext,
} from "./authorize";
import { canCounselInterview } from "./interview";

export function canEditApplicationReview(role: string) {
  return role === "student" || canCounselInterview(role);
}

export async function requireApplicationReviewAccess(
  db: SupabaseClient,
  ctx: ActorContext,
  applicationId: string,
  write = false,
) {
  if (!z.uuid().safeParse(applicationId).success)
    throw new AuthorizationError("Application not found");
  const result = await db
    .from("applications")
    .select(
      "id,student_id,student_college_id,application_type,stage,submitted_at,latest_review_packet_id,colleges(name),students(first_name,last_name)",
    )
    .eq("firm_id", ctx.firmId)
    .eq("id", applicationId)
    .maybeSingle();
  if (result.error) throw new Error("Unable to load application");
  if (!result.data) throw new AuthorizationError("Application not found");
  const relationship = await resolveStudentRelationship(
    db,
    ctx,
    result.data.student_id,
  );
  if (
    !["firm_staff", "assigned_staff", "own_student", "family_parent"].includes(
      relationship,
    ) ||
    (write && !canEditApplicationReview(ctx.role))
  )
    throw new AuthorizationError("Application not found");
  return result.data;
}
