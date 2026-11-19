import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActorContext } from "./authorize";

/** RLS already excludes these in production. Repeat the decision for getDb's
 * local service fallback before pagination, counts, UUID reads or mutations. */
export async function hiddenCoachingTaskIds(
  db: SupabaseClient,
  ctx: ActorContext,
): Promise<string[]> {
  if (ctx.role !== "student") return [];
  const r = await db.rpc("essay_coach_hidden_tasks", {
    p_firm: ctx.firmId,
    p_actor: ctx.dbUserId,
  });
  if (r.error) throw new Error("Unable to verify revision task context");
  return z.array(z.uuid()).parse(r.data);
}
