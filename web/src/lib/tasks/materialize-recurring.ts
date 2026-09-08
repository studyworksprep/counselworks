import { resolveTaskOwner } from "../auth/task-owner";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskCadence } from "@/lib/constants/tasks";
import {
  firmTodayIso,
  occurrenceDueAtIso,
  occurrencesDue,
} from "./recurrence";

/**
 * Recurring task materializer (fix plan 13.3).
 *
 * Turns every due occurrence of the active, non-archived templates into an
 * ordinary `tasks` row — the same shape `materializeTaskForStep` writes for
 * workflow steps, plus `recurring_template_id` / `occurrence_on` so the row
 * is traceable and the partial unique index makes a re-run a no-op.
 *
 * Two callers, one function (CLAUDE.md rule 5):
 *   - the daily Inngest cron (`recurringTasksJob`, service-role client, all
 *     firms) — the steady state;
 *   - the recurring-task server actions (user-scoped client, one template)
 *     right after create / re-activate, so the first occurrence exists the
 *     moment the counselor saves instead of after the next cron tick.
 */

interface TemplateRow {
  id: string;
  firm_id: string;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  visibility_scope: string;
  assigned_user_id: string | null;
  owner_role: string | null;
  student_id: string | null;
  cadence: TaskCadence;
  weekday: number | null;
  day_of_month: number | null;
  starts_on: string;
  last_materialized_on: string | null;
  created_by_user_id: string;
  firms: { timezone: string } | { timezone: string }[] | null;
}

export interface MaterializeResult {
  templates: number;
  created: number;
  /** Occurrences that already existed (unique-index conflict). */
  skipped: number;
  errors: number;
}

const TEMPLATE_SELECT = `id, firm_id, title, description, task_type, priority,
  visibility_scope, owner_role, assigned_user_id, student_id, cadence, weekday, day_of_month,
  starts_on, last_materialized_on, created_by_user_id, firms(timezone)`;

function firmTimezone(row: TemplateRow): string {
  const f = Array.isArray(row.firms) ? row.firms[0] : row.firms;
  return f?.timezone || "America/New_York";
}

export async function materializeRecurringTasks(
  db: SupabaseClient,
  input: {
    /** Restrict to one firm (the cron fans out per firm). */
    firmId?: string;
    /** Restrict to one template (the on-save path). */
    templateId?: string;
    nowMs: number;
    /** Stamped as updated_by on generated rows; defaults to the template author. */
    actorUserId?: string;
  }
): Promise<MaterializeResult> {
  const result: MaterializeResult = { templates: 0, created: 0, skipped: 0, errors: 0 };

  let query = db
    .from("recurring_task_templates")
    .select(TEMPLATE_SELECT)
    .eq("active", true)
    .is("archived_at", null);
  if (input.firmId) query = query.eq("firm_id", input.firmId);
  if (input.templateId) query = query.eq("id", input.templateId);

  const { data, error } = await query;
  if (error) {
    console.error("[materializeRecurringTasks] template load failed:", error);
    result.errors += 1;
    return result;
  }

  const templates = (data ?? []) as unknown as TemplateRow[];
  result.templates = templates.length;

  for (const template of templates) {
    const tz = firmTimezone(template);
    const today = firmTodayIso(input.nowMs, tz);
    const due = occurrencesDue(
      {
        cadence: template.cadence,
        weekday: template.weekday,
        day_of_month: template.day_of_month,
      },
      {
        startsOn: template.starts_on,
        lastMaterializedOn: template.last_materialized_on,
        through: today,
      }
    );
    if (due.length === 0) continue;

    let owner;
    try {
      owner = await resolveTaskOwner(db, { firmId: template.firm_id, studentId: template.student_id,
        actingUserId: template.created_by_user_id, role: template.owner_role, userId: template.assigned_user_id });
    } catch { result.errors += 1; continue; }
    const updatedBy = input.actorUserId ?? template.created_by_user_id;
    let failed = false;

    for (const occurrenceOn of due) {
      const { error: insertError } = await db.from("tasks").insert({
        firm_id: template.firm_id,
        title: template.title,
        description: template.description,
        task_type: template.task_type,
        status: "pending",
        priority: template.priority,
        // Copied from the template — the audience decision was made (and
        // is editable) on the template form.
        visibility_scope: template.visibility_scope,
        assigned_user_id: owner.userId,
        owner_role: owner.role,
        owner_pending: !owner.ready,
        student_id: template.student_id,
        due_at: occurrenceDueAtIso(occurrenceOn, tz),
        recurring_template_id: template.id,
        occurrence_on: occurrenceOn,
        created_by_user_id: template.created_by_user_id,
        updated_by_user_id: updatedBy,
      });
      if (!insertError) {
        result.created += 1;
      } else if (insertError.code === "23505") {
        // Unique (recurring_template_id, occurrence_on): already materialized.
        result.skipped += 1;
      } else {
        console.error(
          `[materializeRecurringTasks] insert failed for template ${template.id} on ${occurrenceOn}:`,
          insertError
        );
        result.errors += 1;
        failed = true;
        break;
      }
    }
    if (failed) continue;

    // Advance the cursor only once every due occurrence exists, so a failed
    // insert is retried on the next pass rather than silently skipped.
    const { error: cursorError } = await db
      .from("recurring_task_templates")
      .update({
        last_materialized_on: due[due.length - 1],
        updated_by_user_id: updatedBy,
      })
      .eq("id", template.id)
      .eq("firm_id", template.firm_id);
    if (cursorError) {
      console.error("[materializeRecurringTasks] cursor update failed:", cursorError);
      result.errors += 1;
    }
  }

  return result;
}
