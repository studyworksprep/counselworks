import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthorizationError, type ActorContext } from "./authorize";
import { canCounselInterview, requireInterviewAccess, requireInterviewRecipient } from "./interview";
import type { AssistanceMode } from "../ai/student-context";

export async function requireStudentAiAccess(db: SupabaseClient, ctx: ActorContext, studentId: string, recipientId: string, mode: AssistanceMode = "questions") {
  if (canCounselInterview(ctx.role)) {
    await requireInterviewRecipient(db, ctx, studentId, recipientId);
  } else {
    await requireInterviewAccess(db, ctx, studentId, "response");
    if (recipientId !== ctx.dbUserId) throw new AuthorizationError("Use your own interview for AI assistance");
    if (mode === "strategy" || (ctx.role === "parent_guardian" && mode !== "questions")) throw new AuthorizationError("This assistance is reserved for the student and counseling team");
  }
}
