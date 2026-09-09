import { deliverTaskNotices } from "../notifications/task-delivery";
import { inngest } from "./inngest";
import {
  sendApplicationDeadlineDigestEmail,
  sendNewMessageNotificationEmail,
  sendMeetingReminderEmail,
  sendMessageDigestEmail,
  sendWeeklyFamilyDigestEmail,
  sendDocumentRequestReminderEmail,
  sendInvoiceOverdueReminderEmail,
} from "@/lib/email";
import { daysPastDue, invoiceBalanceCents, isReminderDay } from "@/lib/billing/aging";
import { formatCents } from "@/lib/agreements/schedule";
import { appBaseUrl, signingLinkPath, signingLinkUrl } from "@/lib/agreements/links";
import { resolveNotificationPrefs } from "@/lib/notifications/prefs";
import { createServerClient } from "@/lib/db/client";
import { isPlaceholderUser } from "@/lib/auth/resolve";
import {
  scorecardToFullColumns,
  walkScorecardCatalog,
  TIGHT_INGEST_FILTERS,
  type ScorecardResult,
} from "@/lib/scorecard/client";
import {
  getStudentWorkflowWithSteps,
} from "@/modules/workflows";
import { runStepActivationAndMaterialize } from "@/lib/workflows/tasks-sync";
import { materializeRecurringTasks } from "@/lib/tasks/materialize-recurring";
import {
  ZERO_USAGE,
  addUsage,
  classifyDiscrepancyFlag,
  enrichNewCollegeRecord,
  type EnrichmentInput,
} from "@/lib/ai/college-ingest";
import type { AiUsage } from "@/lib/ai/client";

// ── New-message notification ────────────────────────────────────────
// Producer: emitMessageCreated in src/lib/actions/messages.ts (fired on
// every conversation creation and message send).
export const sendMessageNotificationJob = inngest.createFunction(
  { id: "send-message-notification", retries: 3 },
  { event: "message/created" },
  async ({ event }) => {
    const { conversationId, messageId, senderUserId, firmId } = event.data as {
      conversationId: string;
      messageId: string;
      senderUserId: string;
      firmId: string;
    };
    const db = createServerClient();

    const [{ data: message }, { data: conversation }, { data: firm }] =
      await Promise.all([
        db
          .from("messages")
          .select("body, sender:sender_user_id(first_name, last_name)")
          .eq("id", messageId)
          .single(),
        db
          .from("conversations")
          .select(
            `firm_id,
             conversation_participants(
               user_id,
               users:user_id(id, first_name, email, auth_provider_user_id)
             )`
          )
          .eq("id", conversationId)
          .single(),
        db.from("firms").select("name").eq("id", firmId).single(),
      ]);

    if (!message || !conversation || conversation.firm_id !== firmId) {
      return { skipped: "message or conversation missing" };
    }

    const sender = message.sender as unknown as {
      first_name: string;
      last_name: string;
    } | null;
    const senderName = sender
      ? `${sender.first_name} ${sender.last_name}`
      : "Your counselor";

    const participants =
      (conversation.conversation_participants as unknown as Array<{
        user_id: string;
        users: {
          id: string;
          first_name: string;
          email: string;
          auth_provider_user_id: string;
        } | null;
      }>) ?? [];

    // Everyone in the room except the sender, with a real (claimed) account.
    const recipients = participants
      .map((p) => p.users)
      .filter((u): u is NonNullable<typeof u> => !!u)
      .filter(
        (u) =>
          u.id !== senderUserId &&
          !isPlaceholderUser(u.auth_provider_user_id) &&
          !!u.email
      );
    if (recipients.length === 0) return { notified: 0 };

    const { data: memberships } = await db
      .from("firm_memberships")
      .select("user_id, role")
      .eq("firm_id", firmId)
      .in(
        "user_id",
        recipients.map((r) => r.id)
      );
    const roleByUser = new Map(
      (memberships ?? []).map((m) => [m.user_id, m.role])
    );

    // Per-user preferences (fix plan 10.4): the in-app feed always gets a
    // row; the email respects message_email (immediate / daily digest / off).
    const { data: prefRows } = await db
      .from("users")
      .select("id, notification_preferences_json")
      .in(
        "id",
        recipients.map((r) => r.id)
      );
    const prefsByUser = new Map(
      (prefRows ?? []).map((u) => [
        u.id,
        resolveNotificationPrefs(u.notification_preferences_json),
      ])
    );

    let notified = 0;
    for (const recipient of recipients) {
      const role = roleByUser.get(recipient.id);
      const portalPath =
        role === "student"
          ? "/student-messages"
          : role === "parent_guardian"
            ? "/family-messages"
            : "/messages";

      await db.from("notifications").insert({
        firm_id: firmId,
        user_id: recipient.id,
        kind: "message",
        title: `New message from ${senderName}`,
        body: message.body.slice(0, 140),
        href: portalPath,
      });

      const prefs =
        prefsByUser.get(recipient.id) ?? resolveNotificationPrefs(null);
      if (prefs.message_email !== "immediate") continue;
      try {
        await sendNewMessageNotificationEmail({
          email: recipient.email,
          recipientFirstName: recipient.first_name,
          senderName,
          firmName: firm?.name ?? "your counseling firm",
          preview: message.body,
          portalPath,
        });
        notified++;
      } catch (e) {
        console.error("Message notification failed for", recipient.id, e);
      }
    }
    return { notified };
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
// Task transitions persist notices in the existing feed (migration 00046).
// The periodic drain recovers failed sends without relying on a best-effort event POST.
export const taskNotificationDeliveryJob = inngest.createFunction(
  {id:"task-notification-delivery",retries:3,concurrency:1},
  {cron:"* * * * *"},
  async()=>deliverTaskNotices(createServerClient()),
);

// Includes overdue work, assigned reviewers, preferences, and current audience.
export const workflowDeadlineRemindersJob = inngest.createFunction(
  {id:"workflow-deadline-reminders",retries:2,concurrency:1},
  {cron:"0 8 * * *"},
  async()=>{
    const db=createServerClient();
    const {data,error}=await db.rpc("enqueue_task_reminders",{});
    if(error)throw new Error("Unable to prepare task reminders");
    return {queued:data,...await deliverTaskNotices(db)};
  },
);

// ── Application deadline reminders (scheduled) ─────────────────────
// Daily digest to each student's counselor of applications due within the
// next 7 days that are not yet submitted.
export const applicationDeadlineRemindersJob = inngest.createFunction(
  { id: "application-deadline-reminders", retries: 2 },
  { cron: "0 8 * * *" },
  async ({ step }) => {
    const now = new Date().toISOString();
    const in7days = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const upcoming = await step.run("fetch-upcoming-deadlines", async () => {
      const db = createServerClient();
      const { data } = await db
        .from("applications")
        .select(
          `id, deadline_at, application_type, stage, student_id, firm_id,
           students!inner(first_name, last_name),
           colleges!inner(name)`
        )
        .in("stage", ["not_started", "in_progress"])
        .gte("deadline_at", now)
        .lte("deadline_at", in7days);
      return data ?? [];
    });

    if (upcoming.length === 0) {
      return { status: "no_deadlines", emailed: 0 };
    }

    // Resolve each student's counselor (primary counselor assignment,
    // falling back to any counselor assignment).
    const recipients = await step.run("resolve-recipients", async () => {
      const db = createServerClient();
      const studentIds = Array.from(
        new Set(upcoming.map((a) => a.student_id as string))
      );
      const { data: assignments } = await db
        .from("student_staff_assignments")
        .select("student_id, user_id, is_primary, users:user_id(email)")
        .eq("assignment_type", "counselor")
        .in("student_id", studentIds);

      const emailByStudent = new Map<string, string>();
      for (const a of assignments ?? []) {
        const email = (
          (a as Record<string, unknown>).users as { email: string } | null
        )?.email;
        if (!email) continue;
        if (a.is_primary || !emailByStudent.has(a.student_id)) {
          emailByStudent.set(a.student_id, email);
        }
      }
      return Object.fromEntries(emailByStudent);
    });

    type NameInfo = { first_name: string; last_name: string };
    type CollegeInfo = { name: string };
    function pickOneRel<T>(v: T | T[] | null | undefined): T | null {
      if (v == null) return null;
      return Array.isArray(v) ? (v[0] ?? null) : v;
    }

    const byEmail = new Map<
      string,
      {
        studentName: string;
        collegeName: string;
        round: string;
        deadline: string;
      }[]
    >();
    for (const app of upcoming) {
      const email = (recipients as Record<string, string>)[
        app.student_id as string
      ];
      if (!email) continue;
      const student = pickOneRel(
        (app as Record<string, unknown>).students as NameInfo | NameInfo[]
      );
      const college = pickOneRel(
        (app as Record<string, unknown>).colleges as CollegeInfo | CollegeInfo[]
      );
      if (!student || !college) continue;
      const list = byEmail.get(email) ?? [];
      list.push({
        studentName: `${student.first_name} ${student.last_name}`,
        collegeName: college.name,
        round: (app.application_type as string) ?? "",
        deadline: app.deadline_at as string,
      });
      byEmail.set(email, list);
    }

    let emailed = 0;
    for (const [email, items] of byEmail) {
      await step.run(`email-${email}`, async () => {
        await sendApplicationDeadlineDigestEmail(email, items);
      });
      emailed++;
    }

    return { status: "complete", emailed, totalApplications: upcoming.length };
  }
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
      return { status: "no_active_workflows", workflowsReconciled: 0 };
    }

    let workflowsReconciled = 0;

    for (const workflowId of workflowIds) {
      const reconciled = await step.run(`advance-${workflowId}`, async () => {
        const db = createServerClient();
        const { data: workflow } = await getStudentWorkflowWithSteps(
          db,
          workflowId,
        );
        if (!workflow || !workflow.workflow_template_id) return 0;

        if (!workflow.created_by_user_id) throw new Error("Workflow author missing");
        const result = await runStepActivationAndMaterialize(db, workflow.id, {
          dbUserId: workflow.created_by_user_id, firmId: workflow.firm_id,
        });
        if (result.error) throw result.error;
        return 1;

      });
      workflowsReconciled += reconciled;
    }

    return {
      status: "complete",
      workflowsScanned: workflowIds.length,
      workflowsReconciled,
    };
  },
);

// ── Bulk Scorecard Ingest ───────────────────────────────────────────
// Adds new colleges to the catalog from the Scorecard API. NEVER mutates
// existing rows — for any Scorecard institution that already matches a
// stored college (by IPEDS / scorecard_id), field differences are written
// to college_discrepancy_flags for an admin to approve or reject.
//
// US News rankings and any other field not produced by Scorecard are out
// of the comparison set and can't be touched by this job.
//
// Mode 'tight' applies the bulk-ingest scope: 4-year + non-profit +
// main campus + ≥500 undergrads (~1,400 institutions).

// Identity-shape fields we compare for existing matches. Metric fields
// (acceptance_rate, sat_avg, etc.) change over time and are handled by
// the existing scorecard sync job — they're explicitly out of scope.
const INGEST_COMPARE_FIELDS = [
  "name",
  "city",
  "state_region",
  "website_url",
  "institution_type",
  "locale_type",
] as const;

interface ProcessOneOutcome {
  inserted: boolean;
  matched: boolean;
  potential_duplicate: boolean;
  flagsCreated: number;
  usage: AiUsage;
}

async function processOneScorecardResult(
  db: ReturnType<typeof createServerClient>,
  result: ScorecardResult,
): Promise<ProcessOneOutcome> {
  const proposed = scorecardToFullColumns(result);
  const checkedAt = new Date().toISOString();
  let usage = ZERO_USAGE;

  // 1. Match by IPEDS scorecard_id (most authoritative)
  const { data: byId } = await db
    .from("colleges")
    .select(
      "id, name, slug, city, state_region, website_url, institution_type, locale_type",
    )
    .eq("scorecard_id", result.id)
    .maybeSingle();

  if (byId) {
    const { flagsCreated, usage: flagUsage } = await writeFieldDiffs(
      db,
      byId,
      proposed,
    );
    usage = addUsage(usage, flagUsage);
    await db
      .from("colleges")
      .update({ last_scorecard_check_at: checkedAt })
      .eq("id", byId.id);
    return { inserted: false, matched: true, potential_duplicate: false, flagsCreated, usage };
  }

  // 2. No IPEDS match — but a row may exist with the same name and a
  // missing scorecard_id. Don't auto-link; raise a potential_duplicate
  // flag so an admin decides whether to merge.
  const { data: byName } = await db
    .from("colleges")
    .select("id, scorecard_id, name")
    .ilike("name", proposed.name)
    .is("scorecard_id", null)
    .limit(1)
    .maybeSingle();

  if (byName) {
    await db.from("college_discrepancy_flags").insert({
      college_id: byName.id,
      kind: "potential_duplicate",
      proposed_scorecard_id: result.id,
      current_value: byName.name as string,
      proposed_value: proposed.name,
      source: "scorecard_ingest",
    });
    return {
      inserted: false,
      matched: false,
      potential_duplicate: true,
      flagsCreated: 1,
      usage,
    };
  }

  // 3. Genuinely new — insert. On slug collision, retry with the IPEDS
  // id appended so the unique constraint is satisfied without losing the
  // readable slug.
  const insertPayload = {
    ...proposed,
    created_via: "scorecard_ingest",
    last_scorecard_check_at: checkedAt,
  };

  let newId: string | null = null;
  const first = await db.from("colleges").insert(insertPayload).select("id").single();
  if (first.error) {
    if (first.error.code === "23505") {
      const retry = await db
        .from("colleges")
        .insert({ ...insertPayload, slug: `${proposed.slug}-${result.id}` })
        .select("id")
        .single();
      if (retry.error) {
        console.error(
          `Failed to insert ${proposed.name} (id ${result.id}) on retry:`,
          retry.error,
        );
        return {
          inserted: false,
          matched: false,
          potential_duplicate: false,
          flagsCreated: 0,
          usage,
        };
      }
      newId = retry.data.id as string;
    } else {
      console.error(
        `Failed to insert ${proposed.name} (id ${result.id}):`,
        first.error,
      );
      return {
        inserted: false,
        matched: false,
        potential_duplicate: false,
        flagsCreated: 0,
        usage,
      };
    }
  } else {
    newId = first.data.id as string;
  }

  // 4. Enrich the newly-inserted row via Claude. Safe to UPDATE the row
  // we just created — no pre-existing data is at risk. Skip silently on
  // any failure: raw Scorecard values are already in place.
  if (newId) {
    try {
      const enrichInput: EnrichmentInput = {
        scorecard_id: result.id,
        name: result["school.name"],
        alias: result["school.alias"] ?? null,
        city: result["school.city"] ?? null,
        state: result["school.state"] ?? null,
        website_url: proposed.website_url ?? null,
        institution_type: proposed.institution_type ?? null,
        locale_type: proposed.locale_type ?? null,
        ownership_code: result["school.ownership"],
        predominant_degree_code:
          result["school.degrees_awarded.predominant"] ?? null,
        undergraduate_size: proposed.undergraduate_size,
      };
      const { enrichment, usage: enrichUsage } = await enrichNewCollegeRecord(
        enrichInput,
      );
      usage = addUsage(usage, enrichUsage);
      if (enrichment) {
        await db
          .from("colleges")
          .update({
            application_platform: enrichment.application_platform,
          })
          .eq("id", newId);
      }
    } catch (e) {
      console.error(`Enrichment failed for ${proposed.name}:`, e);
    }
  }

  return {
    inserted: true,
    matched: false,
    potential_duplicate: false,
    flagsCreated: 0,
    usage,
  };
}

async function writeFieldDiffs(
  db: ReturnType<typeof createServerClient>,
  existing: Record<string, unknown>,
  proposed: ReturnType<typeof scorecardToFullColumns>,
): Promise<{ flagsCreated: number; usage: AiUsage }> {
  let written = 0;
  let usage = ZERO_USAGE;
  const collegeName = (existing.name as string) ?? "Unknown";

  for (const field of INGEST_COMPARE_FIELDS) {
    const currentRaw = existing[field];
    const proposedRaw = (proposed as Record<string, unknown>)[field];
    const current = currentRaw == null ? null : String(currentRaw).trim();
    const next = proposedRaw == null ? null : String(proposedRaw).trim();
    if (current === next) continue;
    if (!next) continue;

    // Skip if an identical pending flag already exists (idempotent re-runs).
    const { data: existingFlag } = await db
      .from("college_discrepancy_flags")
      .select("id")
      .eq("college_id", existing.id as string)
      .eq("field_name", field)
      .eq("status", "pending")
      .maybeSingle();
    if (existingFlag) continue;

    const { data: inserted, error } = await db
      .from("college_discrepancy_flags")
      .insert({
        college_id: existing.id as string,
        kind: "field_diff",
        field_name: field,
        current_value: current,
        proposed_value: next,
        source: "scorecard_ingest",
      })
      .select("id")
      .single();
    if (error || !inserted) continue;
    written++;

    // Classify with Claude. Failures here are non-fatal — the flag is
    // still actionable for the admin without an AI assessment.
    try {
      const { classification, usage: callUsage } =
        await classifyDiscrepancyFlag({
          field_name: field,
          current_value: current,
          proposed_value: next,
          college_name: collegeName,
        });
      usage = addUsage(usage, callUsage);
      if (classification) {
        await db
          .from("college_discrepancy_flags")
          .update({
            claude_classification: classification.classification,
            claude_assessment: classification.assessment,
          })
          .eq("id", inserted.id as string);
      }
    } catch (e) {
      console.error(
        `Classification failed for ${collegeName}.${field}:`,
        e,
      );
    }
  }
  return { flagsCreated: written, usage };
}

export const bulkIngestScorecardJob = inngest.createFunction(
  { id: "bulk-ingest-scorecard", retries: 1, concurrency: [{ limit: 1 }] },
  { event: "colleges/bulk-ingest-scorecard" },
  async ({ event, step }) => {
    const { mode } = (event.data ?? { mode: "tight" }) as { mode: "tight" };
    if (mode !== "tight") {
      throw new Error(`Unsupported ingest mode: ${mode}`);
    }

    const filters = TIGHT_INGEST_FILTERS;
    let totalInserted = 0;
    let totalMatched = 0;
    let totalPotentialDuplicates = 0;
    let totalFlags = 0;
    let totalProcessed = 0;
    let pageIndex = 0;
    let totalUsage = ZERO_USAGE;

    for await (const page of walkScorecardCatalog(filters)) {
      const summary = await step.run(`ingest-page-${page.page}`, async () => {
        const db = createServerClient();
        let inserted = 0;
        let matched = 0;
        let duplicates = 0;
        let flags = 0;
        let usage = ZERO_USAGE;
        for (const result of page.results) {
          if (!result["school.name"] || !result.id) continue;
          const outcome = await processOneScorecardResult(db, result);
          if (outcome.inserted) inserted++;
          if (outcome.matched) matched++;
          if (outcome.potential_duplicate) duplicates++;
          flags += outcome.flagsCreated;
          usage = addUsage(usage, outcome.usage);
        }
        return {
          page: page.page,
          processed: page.results.length,
          inserted,
          matched,
          potential_duplicates: duplicates,
          flags_created: flags,
          total: page.total,
          usage,
        };
      });

      totalProcessed += summary.processed;
      totalInserted += summary.inserted;
      totalMatched += summary.matched;
      totalPotentialDuplicates += summary.potential_duplicates;
      totalFlags += summary.flags_created;
      totalUsage = addUsage(totalUsage, summary.usage);
      pageIndex = summary.page;

      // Pace between pages to be polite to the public API
      if (
        summary.processed > 0 &&
        totalProcessed < summary.total
      ) {
        await step.sleep(`pause-after-page-${pageIndex}`, "2s");
      }
    }

    await step.run("log-final-result", async () => {
      const db = createServerClient();
      await db.from("audit_events").insert({
        entity_type: "scorecard_ingest",
        action_type: "ingest_complete",
        metadata_json: {
          mode,
          processed: totalProcessed,
          inserted: totalInserted,
          matched: totalMatched,
          potential_duplicates: totalPotentialDuplicates,
          flags_created: totalFlags,
          ai_usage: totalUsage,
          completed_at: new Date().toISOString(),
        },
      });
    });

    return {
      status: "complete",
      mode,
      processed: totalProcessed,
      inserted: totalInserted,
      matched: totalMatched,
      potential_duplicates: totalPotentialDuplicates,
      flags_created: totalFlags,
      ai_usage: totalUsage,
    };
  },
);

// ── Recurring tasks (fix plan 13.3) ────────────────────────────────
// Materializes every due occurrence of the active recurring task templates
// into ordinary tasks rows (src/lib/tasks/materialize-recurring.ts — the
// same function the create/resume actions call for one template). Runs
// every six hours rather than once a day so a firm in any timezone gets
// "today's" occurrence before its 09:00 local due time; each pass is
// idempotent (per-template cursor + unique occurrence index), so the extra
// runs are no-ops.
export const recurringTasksJob = inngest.createFunction(
  { id: "recurring-tasks-materialize", retries: 1, concurrency: [{ limit: 1 }] },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    const firmIds = await step.run("fetch-firms-with-templates", async () => {
      const db = createServerClient();
      const { data } = await db
        .from("recurring_task_templates")
        .select("firm_id")
        .eq("active", true)
        .is("archived_at", null);
      return [...new Set((data ?? []).map((r) => r.firm_id as string))];
    });

    if (firmIds.length === 0) {
      return { status: "no_active_templates", created: 0 };
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;
    for (const firmId of firmIds) {
      const result = await step.run(`materialize-${firmId}`, async () => {
        const db = createServerClient();
        return materializeRecurringTasks(db, { firmId, nowMs: Date.now() });
      });
      created += result.created;
      skipped += result.skipped;
      errors += result.errors;
    }

    return { status: "complete", firms: firmIds.length, created, skipped, errors };
  },
);

// ── Meeting reminders (cron, hourly) — fix plan 10.4 ─────────────────
// Producers: the hourly cron itself; consumers: attendee emails + in-app
// feed. The [24h, 25h) window partitions time so each meeting is reminded
// exactly once.
export const meetingRemindersJob = inngest.createFunction(
  { id: "meeting-reminders", retries: 2 },
  { cron: "0 * * * *" },
  async () => {
    const db = createServerClient();
    const windowStart = new Date(Date.now() + 24 * 3600 * 1000);
    const windowEnd = new Date(Date.now() + 25 * 3600 * 1000);

    const { data: meetings } = await db
      .from("meetings")
      .select(
        `id, firm_id, title, scheduled_start_at, location_text,
         firms:firm_id(name),
         meeting_attendees(user_id, users:user_id(id, first_name, email, auth_provider_user_id, notification_preferences_json))`
      )
      .gte("scheduled_start_at", windowStart.toISOString())
      .lt("scheduled_start_at", windowEnd.toISOString());

    let reminded = 0;
    for (const meeting of meetings ?? []) {
      const firm = (Array.isArray(meeting.firms)
        ? meeting.firms[0]
        : meeting.firms) as { name: string } | null;
      const startsAt = new Date(
        meeting.scheduled_start_at as string
      ).toLocaleString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      });
      const attendees = ((meeting as Record<string, unknown>)
        .meeting_attendees ?? []) as Array<{
        users: {
          id: string;
          first_name: string;
          email: string;
          auth_provider_user_id: string;
          notification_preferences_json: unknown;
        } | null;
      }>;
      for (const attendee of attendees) {
        const user = attendee.users;
        if (!user || isPlaceholderUser(user.auth_provider_user_id)) continue;

        await db.from("notifications").insert({
          firm_id: meeting.firm_id,
          user_id: user.id,
          kind: "meeting_reminder",
          title: `Tomorrow: ${meeting.title}`,
          body: startsAt,
          href: "/calendar",
        });

        const prefs = resolveNotificationPrefs(
          user.notification_preferences_json
        );
        if (!prefs.meeting_reminders || !user.email) continue;
        try {
          await sendMeetingReminderEmail({
            email: user.email,
            firstName: user.first_name,
            meetingTitle: meeting.title,
            startsAt,
            location: meeting.location_text,
            firmName: firm?.name ?? "your counseling firm",
          });
          reminded++;
        } catch (e) {
          console.error("Meeting reminder failed for", user.id, e);
        }
      }
    }
    return { meetings: (meetings ?? []).length, reminded };
  }
);

// ── Daily message digest (cron, 13:00 UTC) — fix plan 10.4 ──────────
// For users who chose digest mode over per-message email: one email with
// their unread count from the last day.
export const messageDailyDigestJob = inngest.createFunction(
  { id: "message-daily-digest", retries: 2 },
  { cron: "0 13 * * *" },
  async () => {
    const db = createServerClient();
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    // Digest-mode users only (sparse JSON — filter in SQL then re-verify).
    const { data: users } = await db
      .from("users")
      .select(
        "id, first_name, email, auth_provider_user_id, notification_preferences_json"
      )
      .eq("notification_preferences_json->>message_email", "daily");

    let sent = 0;
    for (const user of users ?? []) {
      if (isPlaceholderUser(user.auth_provider_user_id) || !user.email) {
        continue;
      }
      const prefs = resolveNotificationPrefs(
        user.notification_preferences_json
      );
      if (prefs.message_email !== "daily") continue;

      const { data: memberships } = await db
        .from("firm_memberships")
        .select("firm_id, role, firms:firm_id(name)")
        .eq("user_id", user.id)
        .eq("status", "active");
      for (const membership of memberships ?? []) {
        // Unread = messages to their conversations since yesterday without
        // their read receipt.
        const { data: participantRows } = await db
          .from("conversation_participants")
          .select("conversation_id, conversations!inner(firm_id)")
          .eq("user_id", user.id)
          .eq("conversations.firm_id", membership.firm_id);
        const conversationIds = (participantRows ?? []).map(
          (r) => r.conversation_id
        );
        if (conversationIds.length === 0) continue;

        const { data: messages } = await db
          .from("messages")
          .select("id, sender_user_id, message_reads(user_id)")
          .in("conversation_id", conversationIds)
          .neq("sender_user_id", user.id)
          .gte("sent_at", since)
          .is("deleted_at", null)
          .limit(200);
        const unread = (messages ?? []).filter(
          (m) =>
            !((m as { message_reads: { user_id: string }[] | null })
              .message_reads ?? []).some((r) => r.user_id === user.id)
        ).length;
        if (unread === 0) continue;

        const firm = (Array.isArray(membership.firms)
          ? membership.firms[0]
          : membership.firms) as { name: string } | null;
        const portalPath =
          membership.role === "student"
            ? "/student-messages"
            : membership.role === "parent_guardian"
              ? "/family-messages"
              : "/messages";
        try {
          await sendMessageDigestEmail({
            email: user.email,
            firstName: user.first_name,
            firmName: firm?.name ?? "your counseling firm",
            unreadCount: unread,
            portalPath,
          });
          sent++;
        } catch (e) {
          console.error("Message digest failed for", user.id, e);
        }
      }
    }
    return { sent };
  }
);

// ── Weekly family digest (cron, Mondays 13:00 UTC) — fix plan 10.4 ──
export const weeklyFamilyDigestJob = inngest.createFunction(
  { id: "weekly-family-digest", retries: 2 },
  { cron: "0 13 * * 1" },
  async () => {
    const db = createServerClient();
    const in7Days = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: members } = await db
      .from("family_members")
      .select(
        `firm_id, family_id,
         users:user_id(id, first_name, email, auth_provider_user_id, notification_preferences_json),
         firms:firm_id(name)`
      )
      .in("relationship_type", ["parent", "guardian"]);

    let sent = 0;
    for (const member of members ?? []) {
      const user = (Array.isArray(member.users)
        ? member.users[0]
        : member.users) as {
        id: string;
        first_name: string;
        email: string;
        auth_provider_user_id: string;
        notification_preferences_json: unknown;
      } | null;
      if (!user || isPlaceholderUser(user.auth_provider_user_id) || !user.email) {
        continue;
      }
      const prefs = resolveNotificationPrefs(
        user.notification_preferences_json
      );
      if (!prefs.weekly_digest) continue;

      const { data: students } = await db
        .from("students")
        .select("id, first_name")
        .eq("firm_id", member.firm_id)
        .eq("family_id", member.family_id)
        .is("archived_at", null);
      const studentIds = (students ?? []).map((s) => s.id);
      if (studentIds.length === 0) continue;

      const [{ data: deadlines }, { data: meetings }, { data: decisions }] =
        await Promise.all([
          db
            .from("applications")
            .select("id, deadline_at, students(first_name), colleges(name)")
            .eq("firm_id", member.firm_id)
            .in("student_id", studentIds)
            .gte("deadline_at", now)
            .lte("deadline_at", in7Days),
          db
            .from("meetings")
            .select("id, title, scheduled_start_at")
            .eq("firm_id", member.firm_id)
            .in("visibility_scope", ["family", "firm"])
            .in("student_id", studentIds)
            .gte("scheduled_start_at", now)
            .lte("scheduled_start_at", in7Days),
          db
            .from("applications")
            .select("id, decision_result, decision_at")
            .eq("firm_id", member.firm_id)
            .in("student_id", studentIds)
            .gte(
              "decision_at",
              new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
            ),
        ]);

      const lines: string[] = [];
      for (const d of deadlines ?? []) {
        const student = (Array.isArray(d.students)
          ? d.students[0]
          : d.students) as { first_name: string } | null;
        const college = (Array.isArray(d.colleges)
          ? d.colleges[0]
          : d.colleges) as { name: string } | null;
        lines.push(
          `${student?.first_name ?? "A student"}'s ${college?.name ?? "application"} deadline is ${new Date(d.deadline_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        );
      }
      for (const m of meetings ?? []) {
        lines.push(
          `Meeting: ${m.title} on ${new Date(m.scheduled_start_at as string).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
        );
      }
      if ((decisions ?? []).length > 0) {
        lines.push(
          `${(decisions ?? []).length} admission decision(s) recorded this week — see the portal`
        );
      }
      if (lines.length === 0) continue;

      const firm = (Array.isArray(member.firms)
        ? member.firms[0]
        : member.firms) as { name: string } | null;
      try {
        await sendWeeklyFamilyDigestEmail({
          email: user.email,
          firstName: user.first_name,
          firmName: firm?.name ?? "your counseling firm",
          lines,
        });
        sent++;
      } catch (e) {
        console.error("Weekly digest failed for", user.id, e);
      }
    }
    return { sent };
  }
);

// ── Document-request reminders (cron, daily 8am UTC) ────────────────
// Producer: staff create document_requests (fix plan 10.5). Nudges the
// household to upload while a request stays open past its due date. Stateless
// cadence: fires the day it's due and every 3 days overdue after, so an
// ignored request isn't spammed daily but is never silently dropped
// (fix plan 11.2). Completes 10.5's promised "portal prompts + reminders".
export const documentRequestRemindersJob = inngest.createFunction(
  { id: "document-request-reminders", retries: 2 },
  { cron: "0 8 * * *" },
  async () => {
    const db = createServerClient();
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setUTCHours(23, 59, 59, 999);
    const todayUTC = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );

    const { data: requests } = await db
      .from("document_requests")
      .select("id, firm_id, family_id, student_id, title, due_at")
      .eq("status", "requested")
      .not("due_at", "is", null)
      .lte("due_at", endOfToday.toISOString());

    // Keep only requests due today or an exact multiple of 3 days overdue.
    const due = (requests ?? [])
      .map((r) => {
        const d = new Date(r.due_at as string);
        const dueUTC = Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate()
        );
        return {
          req: r,
          daysOverdue: Math.floor((todayUTC - dueUTC) / 86_400_000),
        };
      })
      .filter(
        ({ daysOverdue }) => daysOverdue >= 0 && daysOverdue % 3 === 0
      );

    if (due.length === 0) return { reminded: 0 };

    const firmIds = Array.from(new Set(due.map((d) => d.req.firm_id as string)));
    const { data: firms } = await db
      .from("firms")
      .select("id, name")
      .in("id", firmIds);
    const firmName = new Map((firms ?? []).map((f) => [f.id, f.name]));

    type Recipient = { email: string; first_name: string };
    function pickUser(v: unknown): {
      id: string;
      email: string;
      first_name: string;
      auth_provider_user_id: string;
    } | null {
      return (Array.isArray(v) ? v[0] : v) as ReturnType<
        typeof pickUser
      > | null;
    }

    let reminded = 0;
    for (const { req, daysOverdue } of due) {
      const overdue = daysOverdue > 0;
      const recipients = new Map<string, Recipient>();

      if (req.family_id) {
        const { data: members } = await db
          .from("family_members")
          .select(
            "users:user_id(id, email, first_name, auth_provider_user_id)"
          )
          .eq("firm_id", req.firm_id)
          .eq("family_id", req.family_id)
          .in("relationship_type", ["parent", "guardian"]);
        for (const m of members ?? []) {
          const u = pickUser(m.users);
          if (u && u.email && !isPlaceholderUser(u.auth_provider_user_id)) {
            recipients.set(u.id, { email: u.email, first_name: u.first_name });
          }
        }
      }
      if (req.student_id) {
        const { data: student } = await db
          .from("students")
          .select("users:user_id(id, email, first_name, auth_provider_user_id)")
          .eq("id", req.student_id)
          .maybeSingle();
        const u = pickUser(student?.users);
        if (u && u.email && !isPlaceholderUser(u.auth_provider_user_id)) {
          recipients.set(u.id, { email: u.email, first_name: u.first_name });
        }
      }

      for (const [userId, r] of recipients) {
        // In-app feed (always on) + email nudge.
        await db.from("notifications").insert({
          firm_id: req.firm_id,
          user_id: userId,
          kind: "document_request_reminder",
          title: overdue
            ? `Still needed: ${req.title}`
            : `Reminder: ${req.title}`,
          body: "Upload it from your documents page when you can.",
          href: "/family-documents",
        });
        try {
          await sendDocumentRequestReminderEmail({
            email: r.email,
            firstName: r.first_name,
            firmName: firmName.get(req.firm_id) ?? "your counseling firm",
            title: req.title as string,
            overdue,
            portalPath: "/family-documents",
          });
        } catch (e) {
          console.error("Doc-request reminder email failed for", userId, e);
        }
        reminded++;
      }
    }

    return { reminded };
  }
);

// ── Overdue-invoice reminders (cron, daily 8am UTC) ──────────────────
// Producer: invoices are generated on agreement execution (fix plan 12.3)
// and flip to paid only via the Stripe webhook (12.4). While an invoice
// stays open past its due date, the household is nudged on the stateless
// cadence in INVOICE_REMINDER_DAYS (day 1, weekly to day 30, then every 30
// days) — in-app feed + email, mirroring document-request reminders — and
// the staff assigned to that family's students get an in-app heads-up
// linking to the household. Completes 12.6's "overdue-invoice reminders via
// the notification system"; the AR aging table on Reports shows the same
// derived overdue state.
export const invoiceOverdueRemindersJob = inngest.createFunction(
  { id: "invoice-overdue-reminders", retries: 2 },
  { cron: "0 8 * * *" },
  async () => {
    const db = createServerClient();
    const today = new Date().toISOString().slice(0, 10);

    interface OverdueInvoiceRow {
      id: string;
      firm_id: string;
      family_id: string;
      invoice_number: string;
      amount_cents: number;
      paid_cents: number;
      credited_cents: number;
      status: string;
      due_on: string;
      installment: { label: string } | { label: string }[] | null;
      families: { household_name: string } | { household_name: string }[] | null;
      agreement: { signing_token: string | null } | { signing_token: string | null }[] | null;
    }
    const { data: rows } = await db
      .from("invoices")
      .select(
        "id, firm_id, family_id, invoice_number, amount_cents, paid_cents, credited_cents, status, due_on, " +
          "installment:installment_id(label), families:family_id(household_name), " +
          "agreement:agreement_id(signing_token)"
      )
      .eq("status", "open")
      .lt("due_on", today);

    const due = ((rows ?? []) as unknown as OverdueInvoiceRow[])
      .map((inv) => ({ inv, daysOverdue: daysPastDue(inv.due_on, today) }))
      .filter(({ daysOverdue }) => isReminderDay(daysOverdue));
    if (due.length === 0) return { reminded: 0 };

    const firmIds = Array.from(new Set(due.map((d) => d.inv.firm_id)));
    const { data: firms } = await db
      .from("firms")
      .select("id, name")
      .in("id", firmIds);
    const firmName = new Map((firms ?? []).map((f) => [f.id, f.name]));

    function pickUser(v: unknown): {
      id: string;
      email: string;
      first_name: string;
      auth_provider_user_id: string;
    } | null {
      return (Array.isArray(v) ? v[0] : v) as ReturnType<
        typeof pickUser
      > | null;
    }

    let reminded = 0;
    for (const { inv, daysOverdue } of due) {
      const installment = (
        Array.isArray(inv.installment) ? inv.installment[0] : inv.installment
      ) as { label: string } | null;
      const family = (
        Array.isArray(inv.families) ? inv.families[0] : inv.families
      ) as { household_name: string } | null;
      // Nag for what is still owed, not the face value (partial payments
      // and credits reduce it).
      const amountFormatted = formatCents(invoiceBalanceCents(inv));
      const installmentLabel = installment?.label ?? "Installment";
      // Where to pay (12.7): the secure link when the agreement has one
      // (works with or without an account), else the portal dashboard.
      const agreementRow = (
        Array.isArray(inv.agreement) ? inv.agreement[0] : inv.agreement
      ) as { signing_token: string | null } | null;
      const signingToken = agreementRow?.signing_token ?? null;
      const payHref = signingToken
        ? signingLinkPath(signingToken)
        : "/family-dashboard";
      const payUrl = signingToken
        ? signingLinkUrl(signingToken)
        : `${appBaseUrl()}/family-dashboard`;

      // Household: parents/guardians with real accounts (placeholders have
      // no portal to pay from and no inbox we should write to).
      const { data: members } = await db
        .from("family_members")
        .select("users:user_id(id, email, first_name, auth_provider_user_id)")
        .eq("firm_id", inv.firm_id)
        .eq("family_id", inv.family_id)
        .in("relationship_type", ["parent", "guardian"]);
      for (const m of members ?? []) {
        const u = pickUser(m.users);
        if (!u || !u.email || isPlaceholderUser(u.auth_provider_user_id)) {
          continue;
        }
        await db.from("notifications").insert({
          firm_id: inv.firm_id,
          user_id: u.id,
          kind: "invoice_overdue",
          title: `Payment reminder: ${inv.invoice_number} (${amountFormatted})`,
          body: `${installmentLabel} was due ${inv.due_on} — ${daysOverdue} day${
            daysOverdue === 1 ? "" : "s"
          } past due. Pay it online from the link.`,
          href: payHref,
        });
        try {
          await sendInvoiceOverdueReminderEmail({
            email: u.email,
            firstName: u.first_name,
            firmName: firmName.get(inv.firm_id) ?? "your counseling firm",
            invoiceNumber: inv.invoice_number,
            installmentLabel,
            amountFormatted,
            dueOn: inv.due_on,
            daysOverdue,
            payUrl,
          });
        } catch (e) {
          console.error("Invoice reminder email failed for", u.id, e);
        }
        reminded++;
      }

      // Staff heads-up (in-app only): everyone assigned to a student in
      // this household, so the counselor who owns the relationship sees
      // the same overdue state the AR report shows.
      const { data: students } = await db
        .from("students")
        .select("id")
        .eq("firm_id", inv.firm_id)
        .eq("family_id", inv.family_id);
      const studentIds = (students ?? []).map((s) => s.id);
      if (studentIds.length > 0) {
        const { data: assignments } = await db
          .from("student_staff_assignments")
          .select("user_id")
          .eq("firm_id", inv.firm_id)
          .in("student_id", studentIds);
        const staffIds = Array.from(
          new Set((assignments ?? []).map((a) => a.user_id as string))
        );
        for (const staffId of staffIds) {
          await db.from("notifications").insert({
            firm_id: inv.firm_id,
            user_id: staffId,
            kind: "invoice_overdue_staff",
            title: `${family?.household_name ?? "A family"}: ${inv.invoice_number} is ${daysOverdue} day${
              daysOverdue === 1 ? "" : "s"
            } past due`,
            body: `${amountFormatted} (${installmentLabel}), due ${inv.due_on}. The household was reminded.`,
            href: `/families/${inv.family_id}/billing`,
          });
        }
      }
    }

    return { reminded };
  }
);

// All functions to register with the Inngest serve handler
export const allFunctions = [
  taskNotificationDeliveryJob,
  sendMessageNotificationJob,
  processDocumentJob,
  bulkIngestScorecardJob,
  workflowDeadlineRemindersJob,
  applicationDeadlineRemindersJob,
  workflowAutoAdvanceJob,
  recurringTasksJob,
  meetingRemindersJob,
  messageDailyDigestJob,
  weeklyFamilyDigestJob,
  documentRequestRemindersJob,
  invoiceOverdueRemindersJob,
];
