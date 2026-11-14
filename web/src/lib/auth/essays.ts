import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AuthorizationError,
  documentReadAllowed,
  resolveStudentRelationship,
  type ActorContext,
} from "./authorize";
import { canCounselInterview } from "./interview";

export async function requireEssayReadAccess(
  db: SupabaseClient,
  ctx: ActorContext,
  essayId: string,
) {
  if (!z.uuid().safeParse(essayId).success)
    throw new AuthorizationError("Essay not found");
  const { data, error } = await db
    .from("essay_drafts")
    .select(
      "id,student_id,visibility_scope,status,current_version_number,submitted_version_id,student_college_id,application_id",
    )
    .eq("firm_id", ctx.firmId)
    .eq("id", essayId)
    .maybeSingle();
  if (error) throw new Error("Unable to load essay access");
  if (
    !data ||
    !documentReadAllowed(
      data.visibility_scope,
      await resolveStudentRelationship(db, ctx, data.student_id),
    )
  )
    throw new AuthorizationError("Essay not found");
  return data;
}

export async function requireEssayWriteAccess(
  db: SupabaseClient,
  ctx: ActorContext,
  essayId: string,
) {
  const essay = await requireEssayReadAccess(db, ctx, essayId);
  if (ctx.role !== "student" && !canCounselInterview(ctx.role))
    throw new AuthorizationError("Essay editing access required");
  if (
    ctx.role === "student" &&
    (!["student", "family"].includes(essay.visibility_scope) ||
      ["approved", "final"].includes(essay.status))
  )
    throw new AuthorizationError(
      "This essay is read-only until your counselor reopens it",
    );
  return essay;
}
