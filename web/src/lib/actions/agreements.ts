"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { requireStaff, requireFamilyAccess } from "../auth/authorize";
import { hasPermission } from "@/modules/permissions/service";
import { recordAuditEvent } from "../audit";
import {
  AGREEMENT_PLACEHOLDERS,
  templatePlaceholders,
  unsupportedPlaceholders,
} from "../agreements/render";
import {
  buildInstallmentSchedule,
  parseDollarsToCents,
} from "../agreements/schedule";
import { type InstallmentFrequency } from "../constants/billing";
import { generateInvoicesForAgreement } from "../billing/generate";
import {
  generateSigningToken,
  recordAgreementSignature,
} from "../agreements/sign";
import { signingLinkPath, signingLinkUrl } from "../agreements/links";
import { sendAgreementSignatureRequestEmail } from "../email";
import {
  requireClientIntake,
  requireProposalAccess,
  type AuthorizedProposal,
} from "../auth/authorize";
import { firmTodayIso } from "../tasks/recurrence";
import { atSigningCents, scheduleTotalCents } from "../proposals/schedule";
import { conversionProblem } from "../proposals/status";
import { engagementAgreementVars } from "../agreements/engagement";
import { parseAgreementTerms } from "../agreements/draft";
import {
  parentFullName,
  studentFullName,
  toProposalView,
  toTermsSource,
} from "../proposals/row";
import { proposalLinkPath } from "../proposals/links";
import { addFamilyMember, createFamily } from "./families";
import { createStudent } from "./students";
import {
  prepareAgreementDocument,
  proposalAgreementReviewToken,
  type AgreementFeeTerms,
  type PreparedAgreementDocument,
} from "../agreements/snapshot";

function permCtx(ctx: { dbUserId: string; firmId: string; role: string }) {
  return {
    userId: ctx.dbUserId,
    firmId: ctx.firmId,
    role: ctx.role,
    assignedStudentIds: [],
  };
}

async function requestEvidence(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ipAddress: forwarded ? forwarded.split(",")[0].trim() : null,
    userAgent: h.get("user-agent"),
  };
}

// ---------------------------------------------------------------------------
// Templates (Settings, manage_firm)
// ---------------------------------------------------------------------------

export async function saveAgreementTemplate(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!hasPermission(permCtx(ctx), "manage_firm")) {
    return { error: "Only owners and admins can edit agreement templates" };
  }

  const templateId = (formData.get("template_id") as string) || null;
  const name = (formData.get("name") as string)?.trim();
  const body = (formData.get("body") as string)?.trim();
  if (!name || !body) return { error: "Name and agreement text are required" };
  // No silent discards: a placeholder nothing can fill would reach the
  // signed contract verbatim ("{{refundable_deadline}}"). Refuse it here,
  // naming what IS supported.
  const unknown = unsupportedPlaceholders(body);
  if (unknown.length > 0) {
    return {
      error:
        `Unsupported placeholder${unknown.length === 1 ? "" : "s"}: ` +
        unknown.map((k) => `{{${k}}}`).join(", ") +
        `. Supported: ` +
        AGREEMENT_PLACEHOLDERS.map((p) => `{{${p.key}}}`).join(", ") +
        ". Write other values into the text directly.",
    };
  }

  const db = getDb();
  if (templateId) {
    const { error } = await db
      .from("agreement_templates")
      .update({ name, body, updated_by_user_id: ctx.dbUserId })
      .eq("id", templateId)
      .eq("firm_id", ctx.firmId);
    if (error) return { error: "Failed to save template" };
  } else {
    const { error } = await db.from("agreement_templates").insert({
      firm_id: ctx.firmId,
      name,
      body,
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    });
    if (error) return { error: "Failed to save template" };
  }
  revalidatePath("/settings");
  revalidatePath("/proposals", "layout");
  return { success: true };
}

export async function updateAgreementGating(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!hasPermission(permCtx(ctx), "manage_firm")) {
    return { error: "Only owners and admins can change this setting" };
  }
  const db = getDb();
  const { error } = await db
    .from("firm_settings")
    .update({
      require_signed_agreement: formData.get("require_signed_agreement") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to update setting" };
  revalidatePath("/settings");
  return { success: true };
}

/** A firm-wide choice made once in Settings, never during proposal conversion. */
export async function updateProposalAgreementTemplate(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!hasPermission(permCtx(ctx), "manage_firm")) return { error: "Only owners and admins can choose the standard agreement" };
  const parsed = z.union([z.literal(""), z.string().uuid()]).safeParse(formData.get("proposal_agreement_template_id") ?? "");
  if (!parsed.success) return { error: "Choose an active agreement template" };
  const db = getDb();
  if (parsed.data) {
    const { data: template, error } = await db.from("agreement_templates").select("id, body")
      .eq("firm_id", ctx.firmId).eq("id", parsed.data).eq("is_active", true).maybeSingle();
    if (error || !template) return { error: "Choose an active template from your firm" };
    if (unsupportedPlaceholders(template.body).length) return { error: "Edit this template to resolve its unsupported placeholders first" };
  }
  const { data, error } = await db.from("firm_settings").update({ proposal_agreement_template_id: parsed.data || null, updated_at: new Date().toISOString() })
    .eq("firm_id", ctx.firmId).select("firm_id").maybeSingle();
  if (error || !data) return { error: "The standard agreement could not be saved" };
  revalidatePath("/settings");
  revalidatePath("/proposals", "layout");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Sending (staff with family access)
// ---------------------------------------------------------------------------

/** What an agreement charges: the fee, the amount due at signing, the lines. */
type FeeTerms = AgreementFeeTerms;

/**
 * Parse the optional fee-terms fields of the send form (12.2). A blank
 * total fee means the agreement is sent without fee terms; anything else
 * must produce a coherent schedule.
 */
function parseFeeTerms(formData: FormData):
  | { feeTerms: null }
  | { feeTerms: FeeTerms }
  | { error: string } {
  const totalRaw = ((formData.get("total_fee") as string) || "").trim();
  const retainerRaw = ((formData.get("retainer") as string) || "").trim();
  if (!totalRaw) {
    // No silent discards (CLAUDE.md rule 7): a retainer without a total is
    // a half-entered fee, not a fee-less agreement.
    if (retainerRaw) {
      return { error: "Enter the total engagement fee, or clear the retainer" };
    }
    return { feeTerms: null };
  }

  const totalFeeCents = parseDollarsToCents(totalRaw);
  if (totalFeeCents === null) return { error: "Enter a valid total fee amount" };
  const retainerCents = retainerRaw === "" ? 0 : parseDollarsToCents(retainerRaw);
  if (retainerCents === null) return { error: "Enter a valid retainer amount" };

  const countRaw = ((formData.get("installment_count") as string) || "").trim();
  const installmentCount = countRaw === "" ? 0 : parseInt(countRaw, 10);
  if (Number.isNaN(installmentCount)) {
    return { error: "Enter a valid installment count" };
  }

  const result = buildInstallmentSchedule({
    totalFeeCents,
    retainerCents,
    installmentCount,
    firstDueOn: ((formData.get("first_due_on") as string) || "").trim() || null,
    frequency:
      (((formData.get("frequency") as string) || "").trim() as InstallmentFrequency) ||
      null,
  });
  if (!result.ok) return { error: result.error };
  return { feeTerms: { totalFeeCents, retainerCents, lines: result.lines } };
}

export async function sendAgreement(familyId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const templateId = formData.get("template_id") as string;
  if (!templateId) return { error: "Choose an agreement template" };

  const parsed = parseFeeTerms(formData);
  if ("error" in parsed) return { error: parsed.error };

  return issueAgreement(getDb(), ctx, {
    familyId,
    templateId,
    feeTerms: parsed.feeTerms,
  });
}

type StaffCtx = NonNullable<Awaited<ReturnType<typeof resolveUserAndFirm>>>;

/**
 * The one path that creates and sends a service agreement: authorize the
 * family, render the immutable snapshot, address it to the household's
 * primary contact, store the payment schedule, and email the signing link.
 * Shared by the Send-agreement form (fee terms typed at send time) and by
 * proposal conversion (a reviewed standard contract with the approved fee
 * and schedule), so the two cannot drift apart.
 */
async function issueAgreement(
  db: ReturnType<typeof getDb>,
  ctx: StaffCtx,
  input: {
    familyId: string;
    templateId?: string;
    /** Server-built document from a reviewed proposal, never client-supplied text. */
    prepared?: PreparedAgreementDocument;
    expectedRecipientEmail?: string;
    expectedFamilyName?: string;
    feeTerms: FeeTerms | null;
    acceptedProposalTitle?: string;
  }
): Promise<{ id: string } | { error: string }> {
  const { familyId, templateId, feeTerms } = input;
  try {
    await requireFamilyAccess(db, ctx, familyId);
  } catch {
    return { error: "Family not found" };
  }

  const [{ data: template }, { data: family }, { data: firm }] =
    await Promise.all([
      templateId ? db
        .from("agreement_templates")
        .select("id, name, body")
        .eq("id", templateId)
        .eq("firm_id", ctx.firmId)
        .eq("is_active", true)
        .maybeSingle() : Promise.resolve({ data: null }),
      db
        .from("families")
        .select("id, household_name")
        .eq("id", familyId)
        .eq("firm_id", ctx.firmId)
        .maybeSingle(),
      db.from("firms").select("name, timezone").eq("id", ctx.firmId).maybeSingle(),
    ]);
  if (!input.prepared && !template) return { error: "Template not found" };
  if (!family) return { error: "Family not found" };
  if (input.expectedFamilyName && input.expectedFamilyName !== family.household_name) {
    return { error: "The household changed after your review — preview the agreement again" };
  }
  const rendered = input.prepared ? { document: input.prepared } : prepareAgreementDocument({
    template: template!, familyName: family.household_name, firmName: firm?.name ?? "the firm",
    todayIso: firmTodayIso(Date.now(), firm?.timezone || "America/New_York"),
    feeTerms,
  });
  if ("error" in rendered) return rendered;
  const document = rendered.document;

  // The agreement is addressed to the household's primary contact (or its
  // first parent/guardian). Resolved BEFORE anything is written: with no
  // recipient there is nobody to sign, and silently creating an agreement
  // nobody can reach would be a discard (CLAUDE.md rule 7).
  const recipient = await resolveAgreementRecipient(db, ctx.firmId, familyId);
  if (!recipient) {
    return {
      error:
        "Add a parent or guardian to this family first — the agreement is addressed to them",
    };
  }

  if (input.expectedRecipientEmail && recipient.email.toLowerCase() !== input.expectedRecipientEmail.toLowerCase()) {
    return { error: "The signing recipient changed after your review — preview the agreement again" };
  }

  const signingToken = generateSigningToken();
  const { data: agreement, error } = await db
    .from("service_agreements")
    .insert({
      firm_id: ctx.firmId,
      family_id: familyId,
      template_id: document.templateId,
      title: document.title,
      body_snapshot: document.body,
      document_hash: document.documentHash,
      status: "sent",
      created_by_user_id: ctx.dbUserId,
      total_fee_cents: feeTerms?.totalFeeCents ?? null,
      retainer_cents: feeTerms ? feeTerms.retainerCents : null,
      invoice_not_before_execution: document.invoiceNotBeforeExecution,
      // 12.7: the secure signing link — sign & pay without a portal account.
      signing_token: signingToken,
      signing_recipient_user_id: recipient.id,
      signing_link_sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !agreement) return { error: "Failed to create agreement" };

  if (feeTerms && feeTerms.lines.length > 0) {
    const { error: installmentError } = await db
      .from("agreement_installments")
      .insert(
        feeTerms.lines.map((l) => ({
          firm_id: ctx.firmId,
          agreement_id: agreement.id,
          installment_number: l.installmentNumber,
          label: l.label,
          amount_cents: l.amountCents,
          is_retainer: l.isRetainer,
          due_on: l.dueOn,
        }))
      );
    if (installmentError) {
      // No cross-statement transaction here; remove the half-created
      // agreement rather than leave it without its signed payment plan.
      await db
        .from("service_agreements")
        .delete()
        .eq("id", agreement.id)
        .eq("firm_id", ctx.firmId);
      return { error: "Failed to save the payment schedule" };
    }
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "service_agreement",
    entityId: agreement.id,
    actionType: "agreement_sent",
    label: `Service agreement sent to ${family.household_name}`,
  });

  try {
    await sendAgreementSignatureRequestEmail({
      email: recipient.email,
      parentFirstName: recipient.first_name,
      firmName: firm?.name ?? "your counseling firm",
      agreementTitle: document.title,
      signingUrl: signingLinkUrl(signingToken),
      acceptedProposalTitle: input.acceptedProposalTitle,
    });
  } catch (e) {
    console.error("Agreement email failed (non-fatal):", e);
  }

  revalidatePath(`/families/${familyId}`);
  revalidatePath(`/families/${familyId}/billing`);
  revalidatePath("/family-dashboard");
  return { id: agreement.id };
}

/**
 * The household member an agreement is addressed to: the primary contact,
 * else the first parent/guardian. Every member has a users row (a
 * placeholder until they claim an account), so the recipient's id can carry
 * the signature and payments recorded through the link (12.7).
 */
async function resolveAgreementRecipient(
  db: ReturnType<typeof getDb>,
  firmId: string,
  familyId: string
): Promise<{ id: string; first_name: string; email: string } | null> {
  const { data: members } = await db
    .from("family_members")
    .select(
      "is_primary_contact, relationship_type, users:user_id(id, first_name, email)"
    )
    .eq("firm_id", firmId)
    .eq("family_id", familyId)
    .in("relationship_type", ["parent", "guardian"])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  const parents = (members ?? [])
    .map((m) => ({
      primary: m.is_primary_contact,
      user: (Array.isArray(m.users) ? m.users[0] : m.users) as {
        id: string;
        first_name: string;
        email: string;
      } | null,
    }))
    .filter((m) => m.user && m.user.email);
  return parents.find((p) => p.primary)?.user ?? parents[0]?.user ?? null;
}

// ---------------------------------------------------------------------------
// From an approved client proposal
// ---------------------------------------------------------------------------

/**
 * Turn the prospect on an approved proposal into client records — the
 * household, the parent as its primary contact, and the student — by
 * running the very same actions the Add Family / Add Member / Add Student
 * forms run, so provisioning (placeholder account, profile, default
 * workflow) is identical. Client intake is an owner/admin handoff
 * (requireClientIntake, fix plan 7.1); a counselor attaches the proposal to
 * a family that has already been added and assigned to them instead.
 *
 * The household is linked to the proposal the moment it exists, so a later
 * step failing never leaves a second household behind on retry.
 */
async function createHouseholdFromProposal(
  db: ReturnType<typeof getDb>,
  ctx: StaffCtx,
  proposal: AuthorizedProposal,
  householdName: string
): Promise<{ familyId: string } | { error: string; familyId?: string }> {
  const familyForm = new FormData();
  familyForm.set("household_name", householdName);
  const family = await createFamily(familyForm);
  if (!("id" in family)) {
    return { error: family.error ?? "Failed to create the household" };
  }
  const familyId = family.id as string;

  const { error: linkError } = await db
    .from("proposals")
    .update({ family_id: familyId })
    .eq("id", proposal.id)
    .eq("firm_id", ctx.firmId);
  // Not fatal — the caller is also handed the id — but worth knowing about.
  if (linkError) console.error("Failed to link household to proposal:", linkError);

  const parentForm = new FormData();
  parentForm.set("first_name", proposal.parent_first_name);
  parentForm.set("last_name", proposal.parent_last_name);
  parentForm.set("email", proposal.parent_email);
  parentForm.set("relationship_type", "parent");
  parentForm.set("is_primary_contact", "on");
  const parent = await addFamilyMember(familyId, parentForm);
  if ("error" in parent && parent.error) {
    return {
      familyId,
      error: `The household "${householdName}" was created, but ${parentFullName(
        proposal
      )} could not be added to it (${parent.error}). Add them on the family page, then create the agreement again.`,
    };
  }

  const studentForm = new FormData();
  studentForm.set("first_name", proposal.student_first_name);
  studentForm.set("last_name", proposal.student_last_name);
  studentForm.set("graduation_year", String(proposal.graduation_year));
  studentForm.set("family_id", familyId);
  const student = await createStudent(studentForm);
  if ("error" in student && student.error) {
    return {
      familyId,
      error: `The household "${householdName}" was created with ${parentFullName(
        proposal
      )}, but the student record for ${studentFullName(
        proposal
      )} could not be (${student.error}). Add the student on the family page, then create the agreement again.`,
    };
  }
  return { familyId };
}

const proposalAgreementInputSchema = z.object({
  familyMode: z.enum(["new", "existing"]),
  familyId: z.union([z.literal(""), z.string().uuid()]),
  householdName: z.string().trim().max(120, "The household name is too long"),
  serviceEndDate: z.union([z.literal(""), z.iso.date()]),
  refundDeadline: z.union([z.literal(""), z.iso.date()]),
});

interface PreparedProposalAgreement {
  proposal: AuthorizedProposal;
  document: PreparedAgreementDocument;
  feeTerms: AgreementFeeTerms;
  familyMode: "new" | "existing";
  familyId: string | null;
  familyName: string;
  recipient: { firstName: string; email: string };
  reviewToken: string;
}

/** Everything required to review the exact document and its destination; no writes. */
async function prepareProposalAgreement(
  db: ReturnType<typeof getDb>, ctx: StaffCtx, proposalId: string, formData: FormData
): Promise<PreparedProposalAgreement | { error: string }> {
  let proposal: AuthorizedProposal;
  try { proposal = await requireProposalAccess(db, ctx, proposalId); }
  catch { return { error: "Proposal not found" } as const; }
  const problem = conversionProblem({ status: proposal.status, agreement_status: proposal.agreement?.status });
  if (problem) return { error: problem } as const;
  const parsed = proposalAgreementInputSchema.safeParse({
    familyMode: formData.get("family_mode"),
    familyId: formData.get("family_id") ?? "",
    householdName: formData.get("household_name") ?? "",
    serviceEndDate: formData.get("service_end_date") ?? "",
    refundDeadline: formData.get("refund_deadline") ?? "",
  });
  if (!parsed.success) return { error: "Check the household details and agreement dates" } as const;
  const input = parsed.data;
  const view = toProposalView(proposal);
  if (view.paymentOptions.length > 1 && !view.selectedPaymentStructure) {
    return { error: "This proposal has no approved payment option — duplicate it and have the client choose a schedule" } as const;
  }
  const option = view.paymentOptions.find((o) => o.structure === (view.selectedPaymentStructure ?? view.paymentStructure));
  if (!option || scheduleTotalCents(option.lines) !== proposal.discounted_cost_cents) {
    return { error: "This proposal's payment schedule doesn't add up to its price — duplicate the proposal, re-save it, and have it approved again" } as const;
  }

  let familyName: string;
  let familyId: string | null = null;
  let recipient: { firstName: string; email: string };
  if (input.familyMode === "new") {
    try { requireClientIntake(ctx); }
    catch { return { error: "Only owners and admins can add a new family. Choose a family already assigned to you, or ask an owner or admin to create the agreement." } as const; }
    if (proposal.family_id) return { error: "This proposal already has a household — choose that existing family" } as const;
    if (!input.householdName) return { error: "Name the new household" } as const;
    familyName = input.householdName;
    recipient = { firstName: proposal.parent_first_name, email: proposal.parent_email };
  } else {
    if (!input.familyId) return { error: "Choose the family this agreement is for" } as const;
    try { await requireFamilyAccess(db, ctx, input.familyId); }
    catch { return { error: "Family not found" } as const; }
    const [{ data: family }, contact] = await Promise.all([
      db.from("families").select("id, household_name").eq("id", input.familyId).eq("firm_id", ctx.firmId).maybeSingle(),
      resolveAgreementRecipient(db, ctx.firmId, input.familyId),
    ]);
    if (!family) return { error: "Family not found" } as const;
    if (!contact) return { error: "Add a parent or guardian to this family first — the agreement is addressed to them" } as const;
    familyId = family.id;
    familyName = family.household_name;
    recipient = { firstName: contact.first_name, email: contact.email };
  }

  const [{ data: firm }, { data: settings, error: settingsError }] = await Promise.all([
    db.from("firms").select("name, timezone").eq("id", ctx.firmId).maybeSingle(),
    db.from("firm_settings").select("proposal_agreement_template_id").eq("firm_id", ctx.firmId).maybeSingle(),
  ]);
  if (settingsError || !settings?.proposal_agreement_template_id) return { error: "An owner or admin must choose the standard proposal agreement in Settings before it can be previewed" };
  const { data: template, error: templateError } = await db.from("agreement_templates").select("id, name, body")
    .eq("id", settings.proposal_agreement_template_id).eq("firm_id", ctx.firmId).eq("is_active", true).maybeSingle();
  if (templateError || !template) return { error: "The standard agreement template is unavailable — ask an owner or admin to update it in Settings" };
  const timezone = firm?.timezone || "America/New_York";
  const todayIso = firmTodayIso(Date.now(), timezone);
  if (templatePlaceholders(template.body).includes("service_end_date") && input.serviceEndDate && input.serviceEndDate < todayIso) return { error: "The service end date cannot be before today" };
  const rawTerms = formData.get("agreement_terms");
  const terms = rawTerms === null ? {
    feeTerms: { totalFeeCents: proposal.discounted_cost_cents, retainerCents: atSigningCents(option.lines), lines: option.lines },
    servicesSummary: view.servicesSummary, testPrepLessons: view.testPrepLessons,
    additionalSessionRateCents: view.additionalSessionRateCents, additionalTerms: "",
  } : parseAgreementTerms(rawTerms);
  if ("error" in terms) return terms;
  const { feeTerms } = terms;
  const rendered = prepareAgreementDocument({
    template, familyName, firmName: firm?.name ?? "your counseling firm", todayIso, feeTerms,
    engagement: engagementAgreementVars({ ...toTermsSource(view), servicesSummary: terms.servicesSummary,
      testPrepLessons: terms.testPrepLessons, additionalSessionRateCents: terms.additionalSessionRateCents },
      { serviceEndDate: input.serviceEndDate, refundDeadline: input.refundDeadline }),
    additionalTerms: terms.additionalTerms, invoiceNotBeforeExecution: true,
  });
  if ("error" in rendered) return rendered;
  const reviewToken = proposalAgreementReviewToken({
    documentHash: rendered.document.documentHash, documentTitle: rendered.document.title, templateId: rendered.document.templateId,
    proposalId: proposal.id, proposalUpdatedAt: proposal.updated_at,
    familyMode: input.familyMode, familyId, familyName, recipientEmail: recipient.email,
  });
  return { proposal, document: rendered.document, feeTerms, familyMode: input.familyMode, familyId, familyName, recipient, reviewToken };
}

export interface ProposalAgreementPreview {
  title: string;
  body: string;
  reviewToken: string;
  recipientEmail: string;
  householdName: string;
}

/** Read-only: previewing never creates a household, agreement, invoice or email. */
export async function previewAgreementFromProposal(proposalId: string, formData: FormData): Promise<ProposalAgreementPreview | { error: string }> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const prepared = await prepareProposalAgreement(getDb(), ctx, proposalId, formData);
  if ("error" in prepared) return prepared;
  return { title: prepared.document.title, body: prepared.document.body, reviewToken: prepared.reviewToken,
    recipientEmail: prepared.recipient.email, householdName: prepared.familyName };
}

/** Rebuild and compare the review before any write, then issue that exact snapshot. */
export async function sendAgreementFromProposal(proposalId: string, formData: FormData): Promise<
  { id: string; familyId: string; warning?: string } | { error: string; familyId?: string }
> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (formData.get("reviewed") !== "on" || typeof formData.get("review_token") !== "string") {
    return { error: "Preview and review the agreement before sending it" };
  }
  const db = getDb();
  const prepared = await prepareProposalAgreement(db, ctx, proposalId, formData);
  if ("error" in prepared) return prepared;
  if (formData.get("review_token") !== prepared.reviewToken) return {
    error: "The agreement or signing recipient changed after your preview — review the updated agreement before sending",
  };
  const { proposal } = prepared;
  let familyId = prepared.familyId;
  if (!familyId) {
    const created = await createHouseholdFromProposal(db, ctx, proposal, prepared.familyName);
    if ("error" in created) return created;
    familyId = created.familyId;
  }
  const issued = await issueAgreement(db, ctx, {
    familyId, feeTerms: prepared.feeTerms, prepared: prepared.document,
    expectedRecipientEmail: prepared.recipient.email, expectedFamilyName: prepared.familyName,
    acceptedProposalTitle: proposal.title,
  });
  if ("error" in issued) return { error: issued.error, familyId };

  const { error: linkError } = await db
    .from("proposals")
    .update({ agreement_id: issued.id, family_id: familyId })
    .eq("id", proposal.id)
    .eq("firm_id", ctx.firmId);
  if (linkError) console.error("Failed to link agreement to proposal:", linkError);

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "proposal",
    entityId: proposal.id,
    actionType: "proposal_converted",
    label: `Service agreement created from proposal: ${proposal.title} (${studentFullName(
      proposal
    )})`,
    metadata: { author_user_id: proposal.created_by_user_id },
  });

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${proposal.id}`);
  revalidatePath(proposalLinkPath("[token]"), "page");
  revalidatePath("/families");
  revalidatePath("/students");
  return linkError
    ? {
        id: issued.id,
        familyId,
        warning:
          "The agreement was sent, but it could not be linked back to this proposal. It is on the family's Billing page.",
      }
    : { id: issued.id, familyId };
}

/**
 * Rotate the signing link and re-send it (12.7). The old URL stops
 * resolving immediately, so a mis-forwarded link is dead the moment staff
 * resend. Allowed for any non-voided agreement: after execution the link is
 * also the household's pay page for the remaining installments.
 */
export async function resendSigningLink(agreementId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  const { data: agreement } = await db
    .from("service_agreements")
    .select("id, family_id, status, title")
    .eq("id", agreementId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!agreement) return { error: "Agreement not found" };
  try {
    await requireFamilyAccess(db, ctx, agreement.family_id);
  } catch {
    return { error: "Agreement not found" };
  }
  if (agreement.status === "voided") {
    return { error: "Voided agreements cannot be resent" };
  }

  const recipient = await resolveAgreementRecipient(
    db,
    ctx.firmId,
    agreement.family_id
  );
  if (!recipient) {
    return { error: "This family has no parent or guardian to send to" };
  }

  const signingToken = generateSigningToken();
  const { error } = await db
    .from("service_agreements")
    .update({
      signing_token: signingToken,
      signing_recipient_user_id: recipient.id,
      signing_link_sent_at: new Date().toISOString(),
    })
    .eq("id", agreementId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to refresh the signing link" };

  const { data: firm } = await db
    .from("firms")
    .select("name")
    .eq("id", ctx.firmId)
    .maybeSingle();
  try {
    await sendAgreementSignatureRequestEmail({
      email: recipient.email,
      parentFirstName: recipient.first_name,
      firmName: firm?.name ?? "your counseling firm",
      agreementTitle: agreement.title,
      signingUrl: signingLinkUrl(signingToken),
    });
  } catch (e) {
    console.error("Agreement email failed (non-fatal):", e);
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "service_agreement",
    entityId: agreementId,
    actionType: "agreement_link_resent",
    label: `Signing link resent: ${agreement.title}`,
  });

  revalidatePath(`/families/${agreement.family_id}`);
  revalidatePath(`/families/${agreement.family_id}/billing`);
  return { success: true };
}

export async function voidAgreement(agreementId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const db = getDb();
  const { data: agreement } = await db
    .from("service_agreements")
    .select("id, family_id, status")
    .eq("id", agreementId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!agreement) return { error: "Agreement not found" };
  if (agreement.status === "completed") {
    return { error: "Completed agreements cannot be voided" };
  }

  const { error } = await db
    .from("service_agreements")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      // 12.7: revoke the public signing link with the agreement.
      signing_token: null,
    })
    .eq("id", agreementId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to void agreement" };

  revalidatePath(`/families/${agreement.family_id}`);
  revalidatePath(`/families/${agreement.family_id}/billing`);
  revalidatePath("/family-dashboard");
  revalidatePath("/sign/[token]", "page");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Signing (firm signer = staff; family signer = parent/guardian member)
// ---------------------------------------------------------------------------

export async function signAgreement(agreementId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const signedName = (formData.get("signed_name") as string)?.trim();
  const consent = formData.get("consent") === "on";
  if (!signedName) return { error: "Type your full legal name to sign" };
  if (!consent) {
    return {
      error: "You must consent to signing this agreement electronically",
    };
  }

  const db = getDb();
  const { data: agreement } = await db
    .from("service_agreements")
    .select("id, family_id, status, title, body_snapshot, document_hash, signing_token, total_fee_cents")
    .eq("id", agreementId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!agreement) return { error: "Agreement not found" };
  if (agreement.status === "voided" || agreement.status === "completed") {
    return { error: `This agreement is already ${agreement.status}` };
  }

  // Role resolution: staff sign for the firm; parents/guardians of THIS
  // family sign for the family. Anyone else is rejected.
  let signerRole: "firm" | "family";
  if (ctx.role === "parent_guardian") {
    const { data: membership } = await db
      .from("family_members")
      .select("id")
      .eq("firm_id", ctx.firmId)
      .eq("family_id", agreement.family_id)
      .eq("user_id", ctx.dbUserId)
      .maybeSingle();
    if (!membership) return { error: "Agreement not found" };
    signerRole = "family";
  } else {
    try {
      requireStaff(ctx);
    } catch {
      return { error: "Not authorized" };
    }
    signerRole = "firm";
  }

  const result = await recordAgreementSignature(db, {
    firmId: ctx.firmId,
    agreement,
    signerUserId: ctx.dbUserId,
    signerRole,
    signedName,
    consent,
    evidence: await requestEvidence(),
  });
  if ("error" in result) return { error: result.error };

  revalidatePath(`/families/${agreement.family_id}`);
  revalidatePath(`/families/${agreement.family_id}/billing`);
  revalidatePath("/family-dashboard");
  revalidatePath(`/family-agreements/${agreementId}`);
  revalidatePath("/family-documents");
  revalidatePath("/documents");
  revalidatePath("/reports"); // new invoices land in the AR aging (12.6)
  revalidatePath(signingLinkPath("[token]"), "page"); // the public link (12.7)
  return { success: true, status: result.status };
}

/**
 * Staff remediation for 12.3: re-run idempotent invoice generation when the
 * inline run at completion partially failed (missing invoices or missing
 * archived PDFs). Rendered only in that broken state — see the staff
 * ServiceAgreementCard.
 */
export async function generateMissingInvoices(agreementId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const db = getDb();
  const { data: agreement } = await db
    .from("service_agreements")
    .select("id, family_id, status")
    .eq("id", agreementId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!agreement) return { error: "Agreement not found" };

  const result = await generateInvoicesForAgreement({
    firmId: ctx.firmId,
    agreementId,
    actorUserId: ctx.dbUserId,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath(`/families/${agreement.family_id}`);
  revalidatePath(`/families/${agreement.family_id}/billing`);
  revalidatePath("/family-dashboard");
  revalidatePath("/family-documents");
  revalidatePath("/documents");
  revalidatePath("/reports");
  return { success: true, created: result.created };
}
