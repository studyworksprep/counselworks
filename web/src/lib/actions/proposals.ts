"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  requireProposalAccess,
  requireProposalAuthoring,
  type AuthorizedProposal,
} from "../auth/authorize";
import { recordAuditEvent } from "../audit";
import { generateSigningToken } from "../agreements/sign";
import { formatCents } from "../agreements/schedule";
import {
  addDays,
  firmTodayIso,
  formatIsoDate,
  parseIsoDate,
} from "../tasks/recurrence";
import {
  DEFAULT_VALIDITY_DAYS,
  type ApprovalSource,
  type ProposalStatus,
} from "../constants/proposals";
import { validateProposalInput, type ValidProposal } from "../proposals/input";
import {
  parseStoredSchedule,
  pastDueLines,
  toStoredSchedule,
} from "../proposals/schedule";
import { proposalEditable, withdrawProblem } from "../proposals/status";
import { proposalLinkPath, proposalLinkUrl } from "../proposals/links";
import { formatLongDate } from "../proposals/terms";
import { parentFullName, studentFullName } from "../proposals/row";
import { sendProposalEmail } from "../email";

/**
 * Staff-side client-proposal actions: write, send, withdraw, duplicate,
 * record an off-line approval, delete a draft. Every action resolves the
 * proposal through requireProposalAccess (tenancy + `manage_clients` +
 * authorship for scoped counselors) and writes through the user-scoped
 * client. Creating the service agreement from an approved proposal lives
 * with the rest of the agreement flow (actions/agreements.ts).
 */

type Ctx = NonNullable<Awaited<ReturnType<typeof resolveUserAndFirm>>>;

async function loadFirm(db: SupabaseClient, firmId: string) {
  const { data } = await db
    .from("firms")
    .select("name, timezone")
    .eq("id", firmId)
    .maybeSingle();
  return {
    name: (data?.name as string | undefined) ?? "your counseling firm",
    todayIso: firmTodayIso(
      Date.now(),
      (data?.timezone as string | undefined) || "America/New_York"
    ),
  };
}

/** Resolve a proposal the caller may act on, or null (reported as not found). */
async function findProposal(
  db: SupabaseClient,
  ctx: Ctx,
  proposalId: string
): Promise<AuthorizedProposal | null> {
  try {
    return await requireProposalAccess(db, ctx, proposalId);
  } catch {
    return null;
  }
}

function revalidateProposal(proposalId: string) {
  revalidatePath("/proposals");
  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath(`/proposals/${proposalId}/edit`);
  // The public page of whichever token this proposal holds (or held).
  revalidatePath(proposalLinkPath("[token]"), "page");
}

function contentColumns(v: ValidProposal) {
  return {
    parent_first_name: v.parentFirstName,
    parent_last_name: v.parentLastName,
    parent_email: v.parentEmail,
    student_first_name: v.studentFirstName,
    student_last_name: v.studentLastName,
    graduation_year: v.graduationYear,
    title: v.title,
    intro_message: v.introMessage,
    services_summary: v.servicesSummary,
    total_cost_cents: v.totalCostCents,
    discount_percent: v.discountPercent,
    discounted_cost_cents: v.discountedCostCents,
    payment_structure: v.paymentStructure,
    deposit_cents: v.depositCents,
    installment_count: v.installmentCount,
    first_due_on: v.firstDueOn,
    payment_schedule_json: toStoredSchedule(v.lines),
    test_prep_lessons: v.testPrepLessons,
    additional_session_rate_cents: v.additionalSessionRateCents,
    terms_and_conditions: v.termsAndConditions,
    valid_until: v.validUntil,
  };
}

/**
 * Create a draft, or update a proposal that is still a draft or out with
 * the client. The payload is re-validated here and every derived value
 * (discount coherence, payment schedule) is recomputed from the raw inputs —
 * nothing computed in the browser is trusted.
 */
export async function saveProposal(
  input: unknown,
  proposalId?: string
): Promise<{ id: string } | { error: string }> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();

  if (!proposalId) {
    try {
      requireProposalAuthoring(ctx);
    } catch {
      return { error: "You don't have permission to write proposals" };
    }
  }
  const existing = proposalId ? await findProposal(db, ctx, proposalId) : null;
  if (proposalId && !existing) return { error: "Proposal not found" };
  if (existing && !proposalEditable(existing.status)) {
    return {
      error:
        "This proposal can no longer be edited — duplicate it to write a new version",
    };
  }

  const firm = await loadFirm(db, ctx.firmId);
  const validated = validateProposalInput(input, firm.todayIso);
  if (!validated.ok) return { error: validated.error };
  const columns = contentColumns(validated.value);

  if (existing) {
    // Conditional on status: if the client approved in the meantime the
    // terms are frozen, and this write matches nothing.
    const { data, error } = await db
      .from("proposals")
      .update(columns)
      .eq("id", existing.id)
      .eq("firm_id", ctx.firmId)
      .in("status", ["draft", "sent"])
      .select("id");
    if (error) {
      console.error("Failed to update proposal:", error);
      return { error: "Failed to save the proposal" };
    }
    if (!data || data.length === 0) {
      return {
        error:
          "The client approved this proposal while you were editing — it can no longer be changed",
      };
    }
    revalidateProposal(existing.id);
    return { id: existing.id };
  }

  const { data, error } = await db
    .from("proposals")
    .insert({
      ...columns,
      firm_id: ctx.firmId,
      status: "draft" satisfies ProposalStatus,
      created_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Failed to create proposal:", error);
    return { error: "Failed to save the proposal" };
  }
  revalidateProposal(data.id);
  return { id: data.id };
}

/**
 * Email the proposal to the prospective client. The first send mints the
 * public link; sending again re-emails the SAME link (the client may open
 * either email — withdraw is how a link is revoked).
 *
 * The link going live is the durable outcome; if the email itself fails,
 * that is reported rather than swallowed, so the counselor can copy the
 * link or resend instead of believing the client was told.
 */
export async function sendProposal(
  proposalId: string
): Promise<{ success: true; warning?: string } | { error: string }> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  const proposal = await findProposal(db, ctx, proposalId);
  if (!proposal) return { error: "Proposal not found" };
  if (proposal.status !== "draft" && proposal.status !== "sent") {
    return { error: "Only a draft or sent proposal can be emailed" };
  }

  const firm = await loadFirm(db, ctx.firmId);
  if (proposal.valid_until < firm.todayIso) {
    return {
      error: "The valid-through date has passed — edit the proposal before sending it",
    };
  }
  const lines = parseStoredSchedule(proposal.payment_schedule_json);
  if (!lines) {
    return { error: "This proposal's payment schedule is incomplete — edit it first" };
  }
  if (pastDueLines(lines, firm.todayIso).length > 0) {
    return {
      error: "A payment date has already passed — edit the proposal before sending it",
    };
  }

  const token = proposal.public_token ?? generateSigningToken();
  const { data: updated, error } = await db
    .from("proposals")
    .update({
      status: "sent" satisfies ProposalStatus,
      public_token: token,
      sent_at: new Date().toISOString(),
    })
    .eq("id", proposal.id)
    .eq("firm_id", ctx.firmId)
    .in("status", ["draft", "sent"])
    .select("id");
  if (error || !updated || updated.length === 0) {
    if (error) console.error("Failed to send proposal:", error);
    return { error: "Failed to send the proposal" };
  }

  // The proposal speaks for its author: their name is on the page and
  // replies go to them, whoever pressed Send.
  const { data: author } = await db
    .from("users")
    .select("first_name, last_name, email")
    .eq("id", proposal.created_by_user_id)
    .maybeSingle();

  let warning: string | undefined;
  try {
    await sendProposalEmail({
      email: proposal.parent_email,
      parentFirstName: proposal.parent_first_name,
      studentFirstName: proposal.student_first_name,
      firmName: firm.name,
      counselorName: author
        ? `${author.first_name} ${author.last_name}`.trim()
        : "Your counselor",
      proposalTitle: proposal.title,
      proposalUrl: proposalLinkUrl(token),
      validUntil: formatLongDate(proposal.valid_until),
      introMessage: proposal.intro_message,
      replyTo: author?.email ?? undefined,
    });
  } catch (e) {
    console.error("Proposal email failed:", e);
    warning = `The proposal link is live, but the email to ${proposal.parent_email} could not be sent. Copy the link and send it yourself, or try again.`;
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "proposal",
    entityId: proposal.id,
    actionType: proposal.status === "draft" ? "proposal_sent" : "proposal_resent",
    label: `Proposal ${proposal.status === "draft" ? "sent" : "re-sent"} to ${parentFullName(
      proposal
    )} (${studentFullName(proposal)}, ${formatCents(proposal.discounted_cost_cents)})`,
    metadata: { author_user_id: proposal.created_by_user_id },
  });

  revalidateProposal(proposal.id);
  return warning ? { success: true, warning } : { success: true };
}

/**
 * Revoke a proposal that is out with the client: the public link stops
 * resolving immediately and the row is kept as history.
 */
export async function withdrawProposal(proposalId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  const proposal = await findProposal(db, ctx, proposalId);
  if (!proposal) return { error: "Proposal not found" };
  const problem = withdrawProblem({
    status: proposal.status,
    agreement_status: proposal.agreement?.status,
  });
  if (problem) return { error: problem };

  const { data: updated, error } = await db
    .from("proposals")
    .update({
      status: "withdrawn" satisfies ProposalStatus,
      withdrawn_at: new Date().toISOString(),
      public_token: null,
    })
    .eq("id", proposal.id)
    .eq("firm_id", ctx.firmId)
    .in("status", ["sent", "approved"])
    .select("id");
  if (error || !updated || updated.length === 0) {
    if (error) console.error("Failed to withdraw proposal:", error);
    return { error: "Failed to withdraw the proposal" };
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "proposal",
    entityId: proposal.id,
    actionType: "proposal_withdrawn",
    label: `Proposal withdrawn: ${proposal.title} (${studentFullName(proposal)})`,
    metadata: { author_user_id: proposal.created_by_user_id },
  });

  revalidateProposal(proposal.id);
  return { success: true };
}

/**
 * Record an approval the client gave off-line (phone, email, in person).
 * Allowed even after the valid-through date: honoring a lapsed proposal is
 * the firm's call. The staff member's own name is kept as who recorded it.
 */
export async function markProposalApproved(proposalId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  const proposal = await findProposal(db, ctx, proposalId);
  if (!proposal) return { error: "Proposal not found" };
  if (proposal.status !== "sent") {
    return {
      error:
        proposal.status === "approved"
          ? "This proposal is already approved"
          : "Send the proposal to the client before recording their approval",
    };
  }

  const { data: me } = await db
    .from("users")
    .select("first_name, last_name")
    .eq("id", ctx.dbUserId)
    .maybeSingle();
  const recordedBy = me ? `${me.first_name} ${me.last_name}`.trim() : "Staff";

  const { data: updated, error } = await db
    .from("proposals")
    .update({
      status: "approved" satisfies ProposalStatus,
      approved_at: new Date().toISOString(),
      approved_by_name: recordedBy,
      approved_via: "staff" satisfies ApprovalSource,
    })
    .eq("id", proposal.id)
    .eq("firm_id", ctx.firmId)
    .eq("status", "sent")
    .select("id");
  if (error || !updated || updated.length === 0) {
    if (error) console.error("Failed to mark proposal approved:", error);
    return { error: "Failed to record the approval" };
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "proposal",
    entityId: proposal.id,
    actionType: "proposal_approved",
    label: `Proposal approval recorded by ${recordedBy}: ${proposal.title} (${studentFullName(
      proposal
    )})`,
    metadata: { author_user_id: proposal.created_by_user_id },
  });

  revalidateProposal(proposal.id);
  return { success: true };
}

/**
 * Copy a proposal into a new draft — the way to revise one that is already
 * approved or withdrawn, and to reuse a package for the next family. The
 * copy belongs to whoever made it and gets a fresh validity window; its
 * client details and payment dates are reviewed in the edit form, which
 * re-validates everything before it can be sent.
 */
export async function duplicateProposal(
  proposalId: string
): Promise<{ id: string } | { error: string }> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  const source = await findProposal(db, ctx, proposalId);
  if (!source) return { error: "Proposal not found" };

  const firm = await loadFirm(db, ctx.firmId);
  const { data, error } = await db
    .from("proposals")
    .insert({
      firm_id: ctx.firmId,
      status: "draft" satisfies ProposalStatus,
      parent_first_name: source.parent_first_name,
      parent_last_name: source.parent_last_name,
      parent_email: source.parent_email,
      student_first_name: source.student_first_name,
      student_last_name: source.student_last_name,
      graduation_year: source.graduation_year,
      title: source.title,
      intro_message: source.intro_message,
      services_summary: source.services_summary,
      total_cost_cents: source.total_cost_cents,
      discount_percent: source.discount_percent,
      discounted_cost_cents: source.discounted_cost_cents,
      payment_structure: source.payment_structure,
      deposit_cents: source.deposit_cents,
      installment_count: source.installment_count,
      first_due_on: source.first_due_on,
      payment_schedule_json: source.payment_schedule_json,
      test_prep_lessons: source.test_prep_lessons,
      additional_session_rate_cents: source.additional_session_rate_cents,
      terms_and_conditions: source.terms_and_conditions,
      valid_until: formatIsoDate(
        addDays(parseIsoDate(firm.todayIso), DEFAULT_VALIDITY_DAYS)
      ),
      created_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Failed to duplicate proposal:", error);
    return { error: "Failed to duplicate the proposal" };
  }
  revalidatePath("/proposals");
  return { id: data.id };
}

/** Delete a draft that was never sent. Anything sent is withdrawn instead. */
export async function deleteProposal(proposalId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  const proposal = await findProposal(db, ctx, proposalId);
  if (!proposal) return { error: "Proposal not found" };
  if (proposal.status !== "draft") {
    return { error: "Only a draft can be deleted — withdraw a sent proposal instead" };
  }

  const { data: deleted, error } = await db
    .from("proposals")
    .delete()
    .eq("id", proposal.id)
    .eq("firm_id", ctx.firmId)
    .eq("status", "draft")
    .select("id");
  if (error || !deleted || deleted.length === 0) {
    if (error) console.error("Failed to delete proposal:", error);
    return { error: "Failed to delete the draft" };
  }
  revalidatePath("/proposals");
  return { success: true };
}
