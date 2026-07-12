"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { requireStaff, requireFamilyAccess } from "../auth/authorize";
import { hasPermission } from "@/modules/permissions/service";
import { recordAuditEvent } from "../audit";
import { renderAgreementBody, nextAgreementStatus } from "../agreements/render";
import { renderSignedAgreementPdf } from "../agreements/pdf";
import {
  uploadFile,
  getStoragePath,
  BUCKET_DOCUMENTS,
} from "../storage";
import {
  sendAgreementSignatureRequestEmail,
  sendAgreementCompletedEmail,
} from "../email";

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

export async function sendAgreement(familyId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const templateId = formData.get("template_id") as string;
  if (!templateId) return { error: "Choose an agreement template" };

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

  // Immutable snapshot: what both parties sign over, hashed.
  const body = renderAgreementBody(template.body, {
    family_name: family.household_name,
    firm_name: firm?.name ?? "the firm",
    date: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  });

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
    })
    .select("id")
    .single();
  if (error || !agreement) return { error: "Failed to create agreement" };

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "service_agreement",
    entityId: agreement.id,
    actionType: "agreement_sent",
    label: `Service agreement sent to ${family.household_name}`,
  });

  // Notify the family's primary contact (or first parent) with a portal link.
  const { data: members } = await db
    .from("family_members")
    .select("is_primary_contact, users:user_id(first_name, email, auth_provider_user_id)")
    .eq("firm_id", ctx.firmId)
    .eq("family_id", familyId);
  const parents = (members ?? [])
    .map((m) => ({
      primary: m.is_primary_contact,
      user: (Array.isArray(m.users) ? m.users[0] : m.users) as {
        first_name: string;
        email: string;
        auth_provider_user_id: string;
      } | null,
    }))
    .filter((m) => m.user);
  const recipient =
    parents.find((p) => p.primary)?.user ?? parents[0]?.user ?? null;
  if (recipient) {
    try {
      await sendAgreementSignatureRequestEmail({
        email: recipient.email,
        parentFirstName: recipient.first_name,
        firmName: firm?.name ?? "your counseling firm",
        agreementTitle: template.name,
      });
    } catch (e) {
      console.error("Agreement email failed (non-fatal):", e);
    }
  }

  revalidatePath(`/families/${familyId}`);
  revalidatePath("/family-dashboard");
  return { id: agreement.id };
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
    .update({ status: "voided", voided_at: new Date().toISOString() })
    .eq("id", agreementId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to void agreement" };

  revalidatePath(`/families/${agreement.family_id}`);
  revalidatePath("/family-dashboard");
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
    .select("id, family_id, status, title, body_snapshot, document_hash")
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

  const evidence = await requestEvidence();
  const { error: sigError } = await db.from("agreement_signatures").insert({
    firm_id: ctx.firmId,
    agreement_id: agreementId,
    signer_user_id: ctx.dbUserId,
    signer_role: signerRole,
    signed_name: signedName,
    consent_given: consent,
    document_hash_at_signing: agreement.document_hash,
    ip_address: evidence.ipAddress,
    user_agent: evidence.userAgent,
  });
  if (sigError) {
    if (sigError.code === "23505") {
      return { error: "This side of the agreement is already signed" };
    }
    return { error: "Failed to record signature" };
  }

  const { data: signatures } = await db
    .from("agreement_signatures")
    .select("signer_role, signed_name, signed_at, ip_address, users:signer_user_id(email)")
    .eq("agreement_id", agreementId)
    .eq("firm_id", ctx.firmId);
  const signedRoles = new Set((signatures ?? []).map((s) => s.signer_role));
  const status = nextAgreementStatus(agreement.status, signedRoles);

  await db
    .from("service_agreements")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", agreementId)
    .eq("firm_id", ctx.firmId);

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "service_agreement",
    entityId: agreementId,
    actionType:
      status === "completed" ? "agreement_completed" : "agreement_signed",
    label:
      status === "completed"
        ? `Service agreement fully executed: ${agreement.title}`
        : `Service agreement signed (${signerRole}): ${agreement.title}`,
  });

  if (status === "completed") {
    await archiveSignedAgreement(db, ctx.firmId, {
      id: agreementId,
      family_id: agreement.family_id,
      title: agreement.title,
      body_snapshot: agreement.body_snapshot,
      document_hash: agreement.document_hash,
      signatures: (signatures ?? []).map((s) => ({
        role: s.signer_role as "firm" | "family",
        signedName: s.signed_name,
        signedAt: new Date(s.signed_at).toUTCString(),
        ipAddress: s.ip_address,
        signerEmail:
          ((Array.isArray(s.users) ? s.users[0] : s.users) as {
            email: string;
          } | null)?.email ?? "",
      })),
      uploaderUserId: ctx.dbUserId,
    });
  }

  revalidatePath(`/families/${agreement.family_id}`);
  revalidatePath("/family-dashboard");
  revalidatePath(`/family-agreements/${agreementId}`);
  return { success: true, status };
}

/**
 * Archive the fully executed agreement: immutable PDF into the documents
 * bucket + a family-visible documents row, and completion emails to both
 * signers.
 */
async function archiveSignedAgreementImpl(
  db: ReturnType<typeof getDb>,
  firmId: string,
  input: {
    id: string;
    family_id: string;
    title: string;
    body_snapshot: string;
    document_hash: string;
    signatures: {
      role: "firm" | "family";
      signedName: string;
      signedAt: string;
      ipAddress: string | null;
      signerEmail: string;
    }[];
    uploaderUserId: string;
  }
) {
  const { data: firm } = await db
    .from("firms")
    .select("name")
    .eq("id", firmId)
    .maybeSingle();
  const firmName = firm?.name ?? "CounselWorks firm";

  const pdfBytes = await renderSignedAgreementPdf({
    title: input.title,
    firmName,
    body: input.body_snapshot,
    documentHash: input.document_hash,
    signatures: input.signatures,
  });

  const fileName = `signed-agreement-${input.id}.pdf`;
  const storageKey = getStoragePath(firmId, "family", input.family_id, fileName);
  // Storage upload runs service-role AFTER the app-layer signing
  // authorization above (allowlisted pattern, see docs/SECURITY.md).
  await uploadFile(
    BUCKET_DOCUMENTS,
    storageKey,
    new Blob([pdfBytes as BlobPart], { type: "application/pdf" })
  );

  const { data: doc } = await db
    .from("documents")
    .insert({
      firm_id: firmId,
      family_id: input.family_id,
      category: "agreement",
      title: `${input.title} (signed)`,
      storage_key: storageKey,
      mime_type: "application/pdf",
      file_size_bytes: pdfBytes.byteLength,
      // Deliberate audience decision: the executed engagement letter belongs
      // to the family — it is always family-visible.
      visibility_scope: "family",
      uploaded_by_user_id: input.uploaderUserId,
    })
    .select("id")
    .single();

  if (doc) {
    await db
      .from("service_agreements")
      .update({ signed_document_id: doc.id })
      .eq("id", input.id)
      .eq("firm_id", firmId);
  }

  for (const sig of input.signatures) {
    if (!sig.signerEmail) continue;
    try {
      await sendAgreementCompletedEmail({
        email: sig.signerEmail,
        signedName: sig.signedName,
        firmName,
        agreementTitle: input.title,
      });
    } catch (e) {
      console.error("Agreement completion email failed (non-fatal):", e);
    }
  }
}

const archiveSignedAgreement = archiveSignedAgreementImpl;
