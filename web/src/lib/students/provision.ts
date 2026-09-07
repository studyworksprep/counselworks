import type { SupabaseClient } from "@supabase/supabase-js";
import { instantiateWorkflowFromTemplate } from "@/modules/workflows/service";
import { materializeTasksForNewWorkflow } from "../workflows/tasks-sync";

/**
 * Create a student the way the New Student form does — row, empty profile,
 * and the firm's default workflow (fix plan 10.8) — so every creation path
 * (form, CSV import) provisions identically. Callers authorize first
 * (requireClientIntake) and pass a firm-scoped client.
 */
export async function provisionStudent(
  db: SupabaseClient,
  actor: { firmId: string; dbUserId: string },
  input: {
    familyId: string;
    firstName: string;
    lastName: string;
    graduationYear: number;
    schoolName: string | null;
  }
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await db
    .from("students")
    .insert({
      firm_id: actor.firmId,
      family_id: input.familyId,
      first_name: input.firstName,
      last_name: input.lastName,
      graduation_year: input.graduationYear,
      school_name: input.schoolName,
      status: "active",
      created_by_user_id: actor.dbUserId,
      updated_by_user_id: actor.dbUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Failed to create student:", error);
    return { error: "Failed to create student" };
  }

  await db.from("student_profiles").insert({
    firm_id: actor.firmId,
    student_id: data.id,
  });

  const { data: settings } = await db
    .from("firm_settings")
    .select("default_workflow_template_id")
    .eq("firm_id", actor.firmId)
    .maybeSingle();
  if (settings?.default_workflow_template_id) {
    const { data: workflow, error: wfError } = await instantiateWorkflowFromTemplate(db, {
      firmId: actor.firmId,
      studentId: data.id,
      templateId: settings.default_workflow_template_id,
      startDate: new Date(),
      createdByUserId: actor.dbUserId,
    });
    if (wfError || !workflow) {
      // Auto-assignment must never fail student creation — log and move on.
      console.error("Default workflow auto-assignment failed:", wfError);
    } else {
      await materializeTasksForNewWorkflow(db, workflow.id, {
        dbUserId: actor.dbUserId,
        firmId: actor.firmId,
      });
    }
  }
  return { id: data.id };
}
