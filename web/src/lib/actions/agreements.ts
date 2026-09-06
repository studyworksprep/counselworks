"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { requireStaff, requireFamilyAccess } from "../auth/authorize";
import { hasPermission } from "@/modules/permissions/service";
import { recordAuditEvent } from "../audit";
import {
  AGREEMENT_PLACEHOLDERS,
  renderAgreementBody,
  templateNeedsFeeTerms,
  unsupportedPlaceholders,
} from "../agreements/render";
import {
  buildInstallmentSchedule,
  formatCents,
  parseDollarsToCents,
  renderFeeTermsSection,
  type InstallmentLine,
} from "../agreements/schedule";
import { type InstallmentFrequency } from "../constants/billing";
import { generateInvoicesForAgreement } from "../billing/generate";
import {
  generateSigningToken,
  recordAgreementSignature,
} from "../agreements/sign";
import { signingLinkPath, signingLinkUrl } from "../agreements/links";
import { sendAgreementSignatureRequestEmail } from "../email";

function permCtx(ctx: { dbUserId: string; firmId: string; role: string }) {
  return {
    userId: ctx.dbUserId,
    firmId: ctx.firmId,
    role: ctx.role,
    assignedStudentIds: [],
  };
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
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

// ---------------------------------------------------------------------------
// Sending (staff with family access)
// ---------------------------------------------------------------------------

/**
 * Parse the optional fee-terms fields of the send form (12.2). A blank
 * total fee means the agreement is sent without fee terms; anything else
 * must produce a coherent schedule.
 */
function parseFeeTerms(formData: FormData):
  | { feeTerms: null }
  | { feeTerms: { totalFeeCents: number; retainerCents: number; lines: InstallmentLine[] } }
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
  const { feeTerms } = parsed;

  const db = getDb();
  try {
    await requireFamilyAccess(db, ctx, familyId);
  } catch {
    return { error: "Family not found" };
  }

  const [{ data: template }, { data: family }, { data: firm }] =
    await Promise.all([
      db
        .from("agreement_templates")
        .select("id, name, body")
        .eq("id", templateId)
        .eq("firm_id", ctx.firmId)
        .eq("is_active", true)
        .maybeSingle(),
      db
        .from("families")
        .select("id, household_name")
        .eq("id", familyId)
        .eq("firm_id", ctx.firmId)
        .maybeSingle(),
      db.from("firms").select("name").eq("id", ctx.firmId).maybeSingle(),
    ]);
  if (!template) return { error: "Template not found" };
  if (!family) return { error: "Family not found" };

  // Templates saved before placeholder validation existed may still carry
  // placeholders nothing can fill — never let one into a signed contract.
  const unknown = unsupportedPlaceholders(template.body);
  if (unknown.length > 0) {
    return {
      error:
        `This template uses unsupported placeholder${unknown.length === 1 ? "" : "s"} ` +
        unknown.map((k) => `{{${k}}}`).join(", ") +
        " — edit the template in Settings first",
    };
  }
  if (!feeTerms && templateNeedsFeeTerms(template.body)) {
    return {
      error:
        "This template includes the fee placeholders — enter the fee terms to send it",
    };
  }

  // Immutable snapshot: what both parties sign over, hashed. Fee terms are
  // appended to the snapshot BEFORE hashing so the signed text carries the
  // exact payment plan stored in agreement_installments (12.2).
  const now = new Date();
  let body = renderAgreementBody(template.body, {
    family_name: family.household_name,
    firm_name: firm?.name ?? "the firm",
    date: now.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    year: String(now.getFullYear()),
    total_fee: feeTerms ? formatCents(feeTerms.totalFeeCents) : undefined,
    deposit_fee: feeTerms ? formatCents(feeTerms.retainerCents) : undefined,
  });
  if (feeTerms) {
    body += renderFeeTermsSection(feeTerms.totalFeeCents, feeTerms.lines);
  }

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

  const signingToken = generateSigningToken();
  const { data: agreement, error } = await db
    .from("service_agreements")
    .insert({
      firm_id: ctx.firmId,
      family_id: familyId,
      template_id: template.id,
      title: template.name,
      body_snapshot: body,
      document_hash: sha256(body),
      status: "sent",
      created_by_user_id: ctx.dbUserId,
      total_fee_cents: feeTerms?.totalFeeCents ?? null,
      retainer_cents: feeTerms ? feeTerms.retainerCents : null,
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
      agreementTitle: template.name,
      signingUrl: signingLinkUrl(signingToken),
    });
  } catch (e) {
    console.error("Agreement email failed (non-fatal):", e);
  }

  revalidatePath(`/families/${familyId}`);
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
    .in("relationship_type", ["parent", "guardian"]);
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
  revalidatePath("/family-dashboard");
  revalidatePath("/family-documents");
  revalidatePath("/documents");
  revalidatePath("/reports");
  return { success: true, created: result.created };
}
