"use server";

import { z } from "zod";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { AuthorizationError, requireCollegeWorkspaceAccess, requireStaff } from "../auth/authorize";
import { revalidateCollegeWorkspaces } from "../colleges/revalidate";

/** An explicit counselor action: null assigns only verified required responses;
 * a prompt id assigns one reviewed optional/conditional response. The RPC locks
 * the list entry, preserves existing writing and rolls back on version failure. */
export async function assignCollegePrompts(studentCollegeId: string, promptId: string | null = null) {
  const input = z.object({ studentCollegeId: z.uuid(), promptId: z.uuid().nullable() })
    .safeParse({ studentCollegeId, promptId });
  if (!input.success) return { error: "Invalid college or prompt" };
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  try {
    requireStaff(ctx);
    await requireCollegeWorkspaceAccess(db, ctx, studentCollegeId);
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "College not found" };
    throw error;
  }
  const { data, error } = await db.rpc("assign_college_prompts", {
    p_firm: ctx.firmId, p_actor: ctx.dbUserId, p_college: studentCollegeId, p_prompt: promptId,
  });
  if (error) {
    console.error("Unable to assign college prompts:", error);
    return { error: "Unable to assign prompts. Check this college's verified coverage and entry year." };
  }
  revalidateCollegeWorkspaces();
  return { assigned: Number(data) };
}
