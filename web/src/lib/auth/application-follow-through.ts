import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthorizationError, type ActorContext } from "./authorize";
import { requireApplicationReviewAccess } from "./application-review";

export async function requireFollowThroughAccess(
  db: SupabaseClient,
  ctx: ActorContext,
  applicationId: string,
  itemId?: string,
  write = false,
) {
  const application = await requireApplicationReviewAccess(
    db,
    ctx,
    applicationId,
    write,
  );
  if (!itemId) return { application, item: null };
  const result = await db
    .from("application_follow_through_items")
    .select("id,revision,family_shared,kind,status")
    .eq("firm_id", ctx.firmId)
    .eq("student_id", application.student_id)
    .eq("application_id", applicationId)
    .eq("id", itemId)
    .maybeSingle();
  if (result.error) throw new Error("Unable to load tracking item");
  if (
    !result.data ||
    (ctx.role === "parent_guardian" && !result.data.family_shared)
  )
    throw new AuthorizationError("Tracking item not found");
  return { application, item: result.data };
}
