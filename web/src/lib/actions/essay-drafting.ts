"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { AuthorizationError } from "../auth/authorize";
import { requireEssayPlanningWrite } from "../auth/essay-planning";
import { requireEssayWriteAccess } from "../auth/essays";
import { canCounselInterview } from "../auth/interview";
import { revisionTaskSchema, saveOutlineSchema } from "../essays/drafting";
import { dateOnly } from "../tasks/due-date";
import { revalidateCollegeWorkspaces } from "../colleges/revalidate";
import { taskPath } from "../constants/task-links";

function text(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}
function refresh(essayId: string) {
  revalidateCollegeWorkspaces();
  for (const prefix of ["/essays", "/student-essays", "/family-essays"])
    revalidatePath(`${prefix}/${essayId}`);
}
export async function saveEssayOutline(form: FormData) {
  let content: unknown, context: unknown;
  try {
    content = JSON.parse(text(form, "content"));
    context = JSON.parse(text(form, "context"));
  } catch {
    return {
      error:
        "Reload to review the current outline and source material. Your edits are still here.",
    };
  }
  const parsed = saveOutlineSchema.safeParse({
    essayId: text(form, "essay_id"),
    revision: Number(text(form, "revision")),
    content,
    context,
    review: text(form, "review"),
    familyShared: text(form, "family_shared") === "yes",
  });
  if (!parsed.success)
    return {
      error:
        "Check the outline fields. Use up to 12 sections, each connected only to material in this essay's plan.",
    };
  try {
    const ctx = await resolveUserAndFirm();
    if (!ctx) throw new AuthorizationError("Please sign in");
    const db = getDb();
    const { data: essay, error: accessError } = await db
      .from("essay_drafts")
      .select("student_id")
      .eq("firm_id", ctx.firmId)
      .eq("id", parsed.data.essayId)
      .maybeSingle();
    if (accessError || !essay) throw new AuthorizationError("Essay not found");
    await requireEssayPlanningWrite(
      db,
      ctx,
      essay.student_id,
      parsed.data.essayId,
    );
    const p = parsed.data;
    if (ctx.role !== "student" && (p.review !== "draft" || p.familyShared))
      return {
        error: "The student reviews the outline and approves parent sharing.",
      };
    const { error } = await db.rpc("save_essay_outline", {
      p_firm: ctx.firmId,
      p_actor: ctx.dbUserId,
      p_essay: p.essayId,
      p_revision: p.revision,
      p_content: p.content,
      p_context: p.context,
      p_review: p.review,
      p_family: p.familyShared,
    });
    if (error) {
      if (error.message.includes("changed in another window"))
        return {
          error:
            "This outline or its planning context changed in another window. Your edits are still here; reload to review the changes before saving.",
        };
      if (error.message.includes("shared with family"))
        return {
          error:
            "Share the essay, reviewed plan and all connected material with family before sharing this outline.",
        };
      if (error.message.includes("response plan"))
        return {
          error:
            "Review and confirm the response plan on the planning board first.",
        };
      if (error.message.includes("connected material"))
        return {
          error:
            "Check the outline purpose and sections, and confirm the connected stories or narratives before marking it reviewed.",
        };
      console.error("Outline save failed", error.code);
      return {
        error:
          "Unable to save the outline. Your edits are still here; check access and reload before trying again.",
      };
    }
    refresh(p.essayId);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof AuthorizationError
          ? error.message
          : "Unable to save. Your edits are still here. Please try again.",
    };
  }
}

export async function createEssayRevisionTask(form: FormData) {
  const dueOn = text(form, "due_on") || null;
  const parsed = revisionTaskSchema.safeParse({
    feedbackId: text(form, "feedback_id"),
    title: text(form, "title"),
    instructions: text(form, "instructions"),
    dueOn,
  });
  if (!parsed.success || (dueOn && !dateOnly.safeParse(dueOn).success))
    return {
      error:
        "Add a title, revision instructions and a valid due date if needed.",
    };
  try {
    const ctx = await resolveUserAndFirm();
    if (!ctx || !canCounselInterview(ctx.role))
      throw new AuthorizationError("Counselor editing access required");
    const db = getDb();
    const { data: feedback, error: sourceError } = await db
      .from("essay_feedback")
      .select("essay_draft_id")
      .eq("firm_id", ctx.firmId)
      .eq("id", parsed.data.feedbackId)
      .maybeSingle();
    if (sourceError || !feedback)
      throw new AuthorizationError("Feedback not found");
    await requireEssayWriteAccess(db, ctx, feedback.essay_draft_id);
    const p = parsed.data;
    const { data: taskId, error } = await db.rpc("create_essay_revision_task", {
      p_firm: ctx.firmId,
      p_actor: ctx.dbUserId,
      p_feedback: p.feedbackId,
      p_title: p.title,
      p_instructions: p.instructions,
      p_due: p.dueOn,
    });
    if (error) {
      if (error.message.includes("already exists"))
        return {
          error:
            "A revision task already exists for this comment. Your instructions are still here; close this editor to open the existing task.",
        };
      console.error("Revision task creation failed", error.code);
      return {
        error:
          "Unable to assign revisions. Share and reopen the essay, then choose an unresolved counselor comment and try again.",
      };
    }
    refresh(feedback.essay_draft_id);
    if (typeof taskId === "string")
      for (const surface of ["staff", "student", "family"] as const)
        revalidatePath(taskPath(taskId, surface));
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof AuthorizationError
          ? error.message
          : "Unable to create the revision task. Your instructions are still here.",
    };
  }
}
