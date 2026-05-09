import { inngest } from "./inngest";
import {
  sendEmail,
  sendInvitationEmail,
  sendDeadlineReminderEmail,
  sendWorkflowStepReminderEmail,
} from "@/lib/email";
import { createServerClient } from "@/lib/db/client";
import {
  searchScorecard,
  getScorecardById,
  scorecardToColumns,
} from "@/lib/scorecard/client";
import {
  activateSteps,
  getStepsByTemplate,
  getStudentWorkflowWithSteps,
  resolveActivatableStepIds,
} from "@/modules/workflows";
import { materializeTaskForStep } from "@/lib/workflows/tasks-sync";

// ── Generic email send ──────────────────────────────────────────────
export const sendEmailJob = inngest.createFunction(
  { id: "send-email", retries: 3 },
  { event: "email/send" },
  async ({ event }) => {
    const { to, subject, html, text, replyTo } = event.data;
    await sendEmail({ to, subject, html, text, replyTo });
  }
);

// ── Invitation email ────────────────────────────────────────────────
export const sendInvitationEmailJob = inngest.createFunction(
  { id: "send-invitation-email", retries: 3 },
  { event: "email/send-invitation" },
  async ({ event }) => {
    const { email, firmName, inviterName, inviteUrl } = event.data;
    await sendInvitationEmail(email, firmName, inviterName, inviteUrl);
  }
);

// ── Deadline reminder email ─────────────────────────────────────────
export const sendDeadlineReminderEmailJob = inngest.createFunction(
  { id: "send-deadline-reminder-email", retries: 3 },
  { event: "email/send-deadline-reminder" },
  async ({ event }) => {
    const { email, studentName, deadlines } = event.data;
    await sendDeadlineReminderEmail(email, studentName, deadlines);
  }
);

// ── Daily digest (scheduled) ────────────────────────────────────────
export const sendDailyDigestJob = inngest.createFunction(
  { id: "send-daily-digest", retries: 3 },
  { event: "email/send-daily-digest" },
  async ({ event }) => {
    const { to, subject, html } = event.data;
    await sendEmail({ to, subject, html });
  }
);

// ── Document processing ─────────────────────────────────────────────
export const processDocumentJob = inngest.createFunction(
  { id: "process-document", retries: 2 },
  { event: "document/process" },
  async ({ event }) => {
    const { documentId, firmId } = event.data;
    const db = createServerClient();

    // Fetch the document record
    const { data: doc, error: fetchError } = await db
      .from("documents")
      .select("id, storage_key, mime_type, file_size_bytes, title, category")
      .eq("id", documentId)
      .eq("firm_id", firmId)
      .single();

    if (fetchError || !doc) {
      console.error("Document not found for processing:", documentId);
      return { status: "skipped", reason: "document_not_found" };
    }

    // Create the initial version record (version 1)
    const { error: versionError } = await db
      .from("document_versions")
      .insert({
        document_id: doc.id,
        version_number: 1,
        storage_key: doc.storage_key,
        uploaded_by_user_id: event.data.uploadedByUserId,
      });

    if (versionError && versionError.code !== "23505") {
      // 23505 = unique violation, version already exists
      console.error("Failed to create document version:", versionError);
    }

    // Log the upload access event
    await db.from("document_access_logs").insert({
      firm_id: firmId,
      document_id: doc.id,
      user_id: event.data.uploadedByUserId,
      action_type: "uploaded",
    });

    // Validate mime type against known categories
    const allowedTypes: Record<string, string[]> = {
      transcript: ["application/pdf", "image/png", "image/jpeg"],
      test_score: ["application/pdf", "image/png", "image/jpeg"],
      recommendation: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      essay: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
      financial: ["application/pdf"],
      other: [], // any type allowed
    };

    const categoryTypes = allowedTypes[doc.category];
    const mimeWarning =
      categoryTypes &&
      categoryTypes.length > 0 &&
      !categoryTypes.includes(doc.mime_type)
        ? `Unexpected file type '${doc.mime_type}' for category '${doc.category}'`
        : null;

    if (mimeWarning) {
      console.warn(`Document ${doc.id}: ${mimeWarning}`);
    }

    return {
      status: "processed",
      documentId: doc.id,
      mimeType: doc.mime_type,
      fileSize: doc.file_size_bytes,
      mimeWarning,
    };
  }
);

// ── Report refresh ──────────────────────────────────────────────────
export const refreshReportsJob = inngest.createFunction(
  { id: "refresh-reports", retries: 2 },
  { event: "reports/refresh" },
  async ({ event }) => {
    const { firmId } = event.data;
    const db = createServerClient();

    // Gather aggregate report data for the firm
    const [
      studentsByStatus,
      appsByStage,
      appDecisions,
      taskStats,
      conversationCount,
      caseload,
      upcomingDeadlines,
    ] = await Promise.all([
      db
        .from("students")
        .select("status")
        .eq("firm_id", firmId)
        .is("archived_at", null),
      db
        .from("applications")
        .select("stage")
        .eq("firm_id", firmId),
      db
        .from("applications")
        .select("decision_result")
        .eq("firm_id", firmId)
        .eq("stage", "decision_received")
        .not("decision_result", "is", null),
      db
        .from("tasks")
        .select("status")
        .eq("firm_id", firmId)
        .is("archived_at", null),
      db
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", firmId),
      db
        .from("student_staff_assignments")
        .select("user_id, users:user_id(first_name, last_name)")
        .eq("firm_id", firmId)
        .eq("is_primary", true),
      db
        .from("applications")
        .select("deadline_at, student_id, college_id")
        .eq("firm_id", firmId)
        .gte("deadline_at", new Date().toISOString())
        .order("deadline_at", { ascending: true })
        .limit(20),
    ]);

    // Build aggregated counts
    function countBy(
      rows: Record<string, unknown>[] | null,
      key: string
    ): Record<string, number> {
      const counts: Record<string, number> = {};
      for (const row of rows ?? []) {
        const val = String(row[key] ?? "unknown");
        counts[val] = (counts[val] ?? 0) + 1;
      }
      return counts;
    }

    // Build caseload summary
    const counselorMap = new Map<string, number>();
    for (const a of caseload.data ?? []) {
      const key = a.user_id as string;
      counselorMap.set(key, (counselorMap.get(key) ?? 0) + 1);
    }

    const snapshot = {
      generatedAt: new Date().toISOString(),
      firmId,
      studentsByStatus: countBy(studentsByStatus.data, "status"),
      applicationsByStage: countBy(appsByStage.data, "stage"),
      decisionOutcomes: countBy(appDecisions.data, "decision_result"),
      tasksByStatus: countBy(taskStats.data, "status"),
      totalConversations: conversationCount.count ?? 0,
      counselorCaseloadCount: counselorMap.size,
      totalUpcomingDeadlines: upcomingDeadlines.data?.length ?? 0,
    };

    // Store the snapshot as an audit event for historical tracking
    await db.from("audit_events").insert({
      firm_id: firmId,
      entity_type: "report",
      entity_id: firmId,
      action: "report_refreshed",
      metadata: snapshot,
    });

    return { status: "refreshed", snapshot };
  }
);

// ── Bulk College Scorecard Sync ──────────────────────────────────────
// Processes colleges in batches with delays to respect API rate limits.
// The College Scorecard API allows ~1,000 requests/hour on a free key.
// We process one college every 4 seconds (~900/hour) to stay safe.
const BATCH_SIZE = 10;
const DELAY_BETWEEN_COLLEGES_MS = 4000;

export const bulkSyncScorecardJob = inngest.createFunction(
  { id: "bulk-sync-scorecard", retries: 1, concurrency: [{ limit: 1 }] },
  { event: "colleges/bulk-sync-scorecard" },
  async ({ event, step }) => {
    const { mode } = event.data as {
      mode: "unsynced" | "stale" | "all";
    };

    // Step 1: get the list of colleges to sync
    const collegeIds = await step.run("fetch-college-list", async () => {
      const db = createServerClient();

      let query = db.from("colleges").select("id, name, scorecard_id").order("name");

      if (mode === "unsynced") {
        query = query.is("scorecard_synced_at", null);
      } else if (mode === "stale") {
        // Stale = synced more than 30 days ago, or never synced
        const thirtyDaysAgo = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        ).toISOString();
        query = query.or(
          `scorecard_synced_at.is.null,scorecard_synced_at.lt.${thirtyDaysAgo}`
        );
      }
      // mode === "all" — no filter

      const { data } = await query;
      return (data ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        scorecard_id: c.scorecard_id as number | null,
      }));
    });

    if (collegeIds.length === 0) {
      return { status: "complete", synced: 0, failed: 0, total: 0 };
    }

    // Step 2: process in batches
    let synced = 0;
    let failed = 0;
    const errors: { name: string; error: string }[] = [];

    for (let batchStart = 0; batchStart < collegeIds.length; batchStart += BATCH_SIZE) {
      const batch = collegeIds.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;

      const batchResult = await step.run(
        `sync-batch-${batchNum}`,
        async () => {
          const batchSynced: string[] = [];
          const batchFailed: { name: string; error: string }[] = [];

          for (const college of batch) {
            try {
              let result;
              if (college.scorecard_id) {
                result = await getScorecardById(college.scorecard_id);
              } else {
                const results = await searchScorecard(college.name);
                result = results[0] ?? null;
              }

              if (!result) {
                batchFailed.push({ name: college.name, error: "No match found" });
                continue;
              }

              const columns = scorecardToColumns(result);
              const db = createServerClient();
              const { error } = await db
                .from("colleges")
                .update(columns)
                .eq("id", college.id);

              if (error) {
                batchFailed.push({ name: college.name, error: error.message });
              } else {
                batchSynced.push(college.name);
              }

              // Delay between requests to respect rate limit
              if (batch.indexOf(college) < batch.length - 1) {
                await new Promise((r) => setTimeout(r, DELAY_BETWEEN_COLLEGES_MS));
              }
            } catch (e) {
              batchFailed.push({
                name: college.name,
                error: e instanceof Error ? e.message : "Unknown error",
              });
            }
          }

          return { synced: batchSynced, failed: batchFailed };
        }
      );

      synced += batchResult.synced.length;
      failed += batchResult.failed.length;
      errors.push(...batchResult.failed);

      // Log progress as an audit event
      await step.run(`log-progress-${batchNum}`, async () => {
        const db = createServerClient();
        await db.from("audit_events").insert({
          entity_type: "scorecard_sync",
          action_type: "sync_progress",
          metadata_json: {
            batch: batchNum,
            totalBatches: Math.ceil(collegeIds.length / BATCH_SIZE),
            synced,
            failed,
            total: collegeIds.length,
          },
        });
      });

      // Delay between batches
      if (batchStart + BATCH_SIZE < collegeIds.length) {
        await step.sleep(`pause-after-batch-${batchNum}`, "5s");
      }
    }

    // Step 3: log final result
    await step.run("log-final-result", async () => {
      const db = createServerClient();
      await db.from("audit_events").insert({
        entity_type: "scorecard_sync",
        action_type: "sync_complete",
        metadata_json: {
          mode,
          synced,
          failed,
          total: collegeIds.length,
          errors: errors.slice(0, 20),
          completedAt: new Date().toISOString(),
        },
      });
    });

    return { status: "complete", synced, failed, total: collegeIds.length, errors: errors.slice(0, 20) };
  }
);

// ── Workflow step deadline reminders (cron, daily 8am UTC) ──────────
// Looks up workflow steps coming due in the next 48 hours and emails each
// distinct assignee one digest covering their upcoming steps.
export const workflowDeadlineRemindersJob = inngest.createFunction(
  { id: "workflow-deadline-reminders", retries: 2 },
  { cron: "0 8 * * *" },
  async ({ step }) => {
    const today = new Date().toISOString().slice(0, 10);
    const in48 = new Date(Date.now() + 48 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const upcoming = await step.run("fetch-upcoming-steps", async () => {
      const db = createServerClient();
      const { data } = await db
        .from("student_workflow_steps")
        .select(
          `id, title, due_date, assigned_user_id,
           student_workflows!inner(name, students!inner(first_name, last_name)),
           workflow_template_steps!inner(name),
           assignee:users!student_workflow_steps_assigned_user_id_fkey(email)`,
        )
        .in("status", ["pending", "in_progress"])
        .not("assigned_user_id", "is", null)
        .gte("due_date", today)
        .lte("due_date", in48);
      return data ?? [];
    });

    if (upcoming.length === 0) {
      return { status: "no_steps_due", emailed: 0 };
    }

    // Group by assignee email so each user gets one digest.
    const byEmail = new Map<
      string,
      { title: string; studentName: string; workflowName: string; dueDate: string }[]
    >();

    for (const row of upcoming as Array<{
      title: string | null;
      due_date: string;
      student_workflows: {
        name: string | null;
        students: { first_name: string; last_name: string };
      };
      workflow_template_steps: { name: string };
      assignee: { email: string } | null;
    }>) {
      const email = row.assignee?.email;
      if (!email) continue;
      const wf = Array.isArray(row.student_workflows)
        ? row.student_workflows[0]
        : row.student_workflows;
      const tmpl = Array.isArray(row.workflow_template_steps)
        ? row.workflow_template_steps[0]
        : row.workflow_template_steps;
      const studentObj = Array.isArray(wf.students) ? wf.students[0] : wf.students;
      const list = byEmail.get(email) ?? [];
      list.push({
        title: row.title ?? tmpl.name,
        studentName: `${studentObj.first_name} ${studentObj.last_name}`,
        workflowName: wf.name ?? "Workflow",
        dueDate: row.due_date,
      });
      byEmail.set(email, list);
    }

    let emailed = 0;
    for (const [email, items] of byEmail) {
      await step.run(`email-${email}`, async () => {
        await sendWorkflowStepReminderEmail(email, items);
      });
      emailed++;
    }

    return { status: "complete", emailed, totalSteps: upcoming.length };
  },
);

// ── Workflow auto-advance (cron, nightly 2am UTC) ───────────────────
// Safety net for the action-layer activation chain. Sweeps active workflows
// and re-evaluates dependencies in case a step was completed via a path
// that didn't trigger downstream activation.
export const workflowAutoAdvanceJob = inngest.createFunction(
  { id: "workflow-auto-advance", retries: 1, concurrency: [{ limit: 1 }] },
  { cron: "0 2 * * *" },
  async ({ step }) => {
    const workflowIds = await step.run("fetch-active-workflows", async () => {
      const db = createServerClient();
      const { data } = await db
        .from("student_workflows")
        .select("id")
        .in("status", ["not_started", "in_progress"])
        .not("workflow_template_id", "is", null);
      return (data ?? []).map((r) => r.id as string);
    });

    if (workflowIds.length === 0) {
      return { status: "no_active_workflows", activated: 0 };
    }

    let totalActivated = 0;

    for (const workflowId of workflowIds) {
      const activated = await step.run(`advance-${workflowId}`, async () => {
        const db = createServerClient();
        const { data: workflow } = await getStudentWorkflowWithSteps(
          db,
          workflowId,
        );
        if (!workflow || !workflow.workflow_template_id) return 0;

        const { data: templateSteps } = await getStepsByTemplate(
          db,
          workflow.workflow_template_id,
        );
        const activatable = resolveActivatableStepIds(
          workflow.student_workflow_steps,
          templateSteps,
        );
        if (activatable.length === 0) return 0;

        await activateSteps(db, activatable);

        // Materialize tasks for the newly activated steps so they show up on
        // the assignee's dashboard. Use the workflow author as the fallback
        // actor since this runs without a user session.
        const fallbackUser = workflow.created_by_user_id;
        if (fallbackUser) {
          for (const stepId of activatable) {
            await materializeTaskForStep(db, stepId, {
              dbUserId: fallbackUser,
              firmId: workflow.firm_id,
            });
          }
        }
        return activatable.length;
      });
      totalActivated += activated;
    }

    return {
      status: "complete",
      workflowsScanned: workflowIds.length,
      activated: totalActivated,
    };
  },
);

// All functions to register with the Inngest serve handler
export const allFunctions = [
  sendEmailJob,
  sendInvitationEmailJob,
  sendDeadlineReminderEmailJob,
  sendDailyDigestJob,
  processDocumentJob,
  refreshReportsJob,
  bulkSyncScorecardJob,
  workflowDeadlineRemindersJob,
  workflowAutoAdvanceJob,
];
