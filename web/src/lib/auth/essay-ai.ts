import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthorizationError, type ActorContext } from "./authorize";
import { requireEssayPlanningWrite } from "./essay-planning";
import { requireEssayReadAccess } from "./essays";

export async function requireEssayAiAccess(
  db: SupabaseClient,
  ctx: ActorContext,
  essayId: string,
) {
  const essay = await requireEssayReadAccess(db, ctx, essayId);
  await requireEssayPlanningWrite(db, ctx, essay.student_id, essayId);
  if (ctx.role === "parent_guardian")
    throw new AuthorizationError(
      "Students review plans and outlines before sharing them with family.",
    );
  return essay;
}
