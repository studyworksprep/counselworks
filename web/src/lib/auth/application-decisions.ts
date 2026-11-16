import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthorizationError, type ActorContext } from "./authorize";
import { requireApplicationReviewAccess } from "./application-review";

export async function requireDecisionAccess(
  db: SupabaseClient,
  ctx: ActorContext,
  applicationId: string,
  stepId?: string,
  write = false,
) {
  const application = await requireApplicationReviewAccess(
    db,
    ctx,
    applicationId,
    write,
  );
  if (!stepId) return { application, step: null };
  const result = await db
    .from("application_next_steps")
    .select("id,revision,family_shared,kind,status,decision_revision")
    .eq("firm_id", ctx.firmId)
    .eq("student_id", application.student_id)
    .eq("application_id", applicationId)
    .eq("id", stepId)
    .maybeSingle();
  if (result.error) throw new Error("Unable to load next step");
  if (
    !result.data ||
    (ctx.role === "parent_guardian" && !result.data.family_shared)
  )
    throw new AuthorizationError("Next step not found");
  return { application, step: result.data };
}
