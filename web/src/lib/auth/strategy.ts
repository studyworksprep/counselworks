import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthorizationError, type ActorContext } from "./authorize";
import { requireInterviewAccess } from "./interview";

export async function requireStrategyAccess(db: SupabaseClient, ctx: ActorContext, studentId: string, mode: "edit" | "review") {
  await requireInterviewAccess(db, ctx, studentId, mode === "edit" ? "counsel" : "response");
  if (mode === "review" && ctx.role !== "student") throw new AuthorizationError("Only the student reviews and shares their strategy brief");
}
