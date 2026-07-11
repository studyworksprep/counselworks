import { inngest } from "./inngest";
import {
  sendWorkflowStepReminderEmail,
  sendApplicationDeadlineDigestEmail,
  sendNewMessageNotificationEmail,
} from "@/lib/email";
import { createServerClient } from "@/lib/db/client";
import {
  scorecardToFullColumns,
  walkScorecardCatalog,
  TIGHT_INGEST_FILTERS,
  type ScorecardResult,
} from "@/lib/scorecard/client";
import {
  activateSteps,
  getStepsByTemplate,
  getStudentWorkflowWithSteps,
  resolveActivatableStepIds,
} from "@/modules/workflows";
import { materializeTaskForStep } from "@/lib/workflows/tasks-sync";
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
          !u.auth_provider_user_id.startsWith("invited_") &&
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

    let notified = 0;
    for (const recipient of recipients) {
      const role = roleByUser.get(recipient.id);
      const portalPath =
        role === "student"
          ? "/student-messages"
          : role === "parent_guardian"
            ? "/family-messages"
            : "/messages";
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

    // Supabase typegen returns relationship selects as arrays even for the
    // to-one FKs here; normalize each one before access.
    type StudentInfo = { first_name: string; last_name: string };
    type WorkflowInfo = {
      name: string | null;
      students: StudentInfo | StudentInfo[];
    };
    type TemplateStepInfo = { name: string };
    type AssigneeInfo = { email: string };
    type RawRow = {
      title: string | null;
      due_date: string;
      student_workflows: WorkflowInfo | WorkflowInfo[];
      workflow_template_steps: TemplateStepInfo | TemplateStepInfo[];
      assignee: AssigneeInfo | AssigneeInfo[] | null;
    };

    function pickOne<T>(v: T | T[] | null | undefined): T | null {
      if (v == null) return null;
      return Array.isArray(v) ? v[0] ?? null : v;
    }

    for (const row of upcoming as RawRow[]) {
      const assignee = pickOne(row.assignee);
      if (!assignee?.email) continue;
      const wf = pickOne(row.student_workflows);
      const tmpl = pickOne(row.workflow_template_steps);
      const studentObj = wf ? pickOne(wf.students) : null;
      if (!wf || !tmpl || !studentObj) continue;
      const list = byEmail.get(assignee.email) ?? [];
      list.push({
        title: row.title ?? tmpl.name,
        studentName: `${studentObj.first_name} ${studentObj.last_name}`,
        workflowName: wf.name ?? "Workflow",
        dueDate: row.due_date,
      });
      byEmail.set(assignee.email, list);
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

// All functions to register with the Inngest serve handler
export const allFunctions = [
  sendMessageNotificationJob,
  processDocumentJob,
  bulkIngestScorecardJob,
  workflowDeadlineRemindersJob,
  applicationDeadlineRemindersJob,
  workflowAutoAdvanceJob,
];
