import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthorizationError, type ActorContext } from "./authorize";
import { requireInterviewAccess } from "./interview";

export async function requireEssayPlanningWrite(db: SupabaseClient, ctx: ActorContext, studentId: string, essayId: string) {
  await requireInterviewAccess(db, ctx, studentId, "bank");
  const { data, error } = await db.from("essay_drafts").select("id,student_id,visibility_scope")
    .eq("firm_id", ctx.firmId).eq("student_id", studentId).eq("id", essayId).maybeSingle();
  if (error || !data || (ctx.role === "student" && !["student", "family", "firm"].includes(data.visibility_scope))) throw new AuthorizationError("Essay planning is not available for this response");
  return data;
}
