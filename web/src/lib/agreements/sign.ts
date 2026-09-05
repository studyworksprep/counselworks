import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { recordAuditEvent } from "../audit";
import { uploadFile, getStoragePath, BUCKET_DOCUMENTS } from "../storage";
import { sendAgreementCompletedEmail } from "../email";
import { generateInvoicesForAgreement } from "../billing/generate";
import { nextAgreementStatus } from "./render";
import { renderSignedAgreementPdf } from "./pdf";

/**
 * Shared signing core (fix plan 10.1 → 12.7). Both entry points — the
 * authenticated portal/staff action (src/lib/actions/agreements.ts) and the
 * token-authorized public link (src/lib/actions/public-agreement.ts) —
 * record signatures through this one path, so the status machine, the
 * archived PDF, the completion emails, and invoice generation cannot drift
 * between "signed in the portal" and "signed by link". The caller has
 * already authorized the signer and passes a client scoped accordingly.
 */

/** 24 random bytes → 48 hex chars, the same shape as calendar-feed tokens. */
export function generateSigningToken(): string {
  return randomBytes(24).toString("hex");
}

export interface SignableAgreement {
  id: string;
  family_id: string;
  status: string;
  title: string;
  body_snapshot: string;
  document_hash: string;
}

export async function recordAgreementSignature(
  db: SupabaseClient,
  input: {
    firmId: string;
    agreement: SignableAgreement;
    signerUserId: string;
    signerRole: "firm" | "family";
    signedName: string;
    consent: boolean;
    evidence: { ipAddress: string | null; userAgent: string | null };
  }
): Promise<{ status: string } | { error: string }> {
  const { firmId, agreement } = input;
  if (agreement.status === "voided" || agreement.status === "completed") {
    return { error: `This agreement is already ${agreement.status}` };
  }

  const { error: sigError } = await db.from("agreement_signatures").insert({
    firm_id: firmId,
    agreement_id: agreement.id,
    signer_user_id: input.signerUserId,
    signer_role: input.signerRole,
    signed_name: input.signedName,
    consent_given: input.consent,
    document_hash_at_signing: agreement.document_hash,
    ip_address: input.evidence.ipAddress,
    user_agent: input.evidence.userAgent,
  });
  if (sigError) {
    if (sigError.code === "23505") {
      return { error: "This side of the agreement is already signed" };
    }
    return { error: "Failed to record signature" };
  }

  const { data: signatures } = await db
    .from("agreement_signatures")
    .select(
      "signer_role, signed_name, signed_at, ip_address, users:signer_user_id(email)"
    )
    .eq("agreement_id", agreement.id)
    .eq("firm_id", firmId);
  const signedRoles = new Set((signatures ?? []).map((s) => s.signer_role));
  const status = nextAgreementStatus(agreement.status, signedRoles);

  await db
    .from("service_agreements")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", agreement.id)
    .eq("firm_id", firmId);

  await recordAuditEvent(db, {
    firmId,
    actorUserId: input.signerUserId,
    entityType: "service_agreement",
    entityId: agreement.id,
    actionType:
      status === "completed" ? "agreement_completed" : "agreement_signed",
    label:
      status === "completed"
        ? `Service agreement fully executed: ${agreement.title}`
        : `Service agreement signed (${input.signerRole}): ${agreement.title}`,
  });

  if (status === "completed") {
    await archiveSignedAgreement(db, firmId, {
      id: agreement.id,
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
      uploaderUserId: input.signerUserId,
    });

    // 12.3: the executed fee terms become invoices + archived PDFs.
    // Non-fatal like the archive emails — the signatures are already
    // recorded, and generation is idempotent if it needs a re-run.
    try {
      const generated = await generateInvoicesForAgreement({
        firmId,
        agreementId: agreement.id,
        actorUserId: input.signerUserId,
      });
      if ("error" in generated) {
        console.error("Invoice generation failed (non-fatal):", generated.error);
      }
    } catch (e) {
      console.error("Invoice generation failed (non-fatal):", e);
    }
  }

  return { status };
}

/**
 * Archive the fully executed agreement: immutable PDF into the documents
 * bucket + a family-visible documents row, and completion emails to both
 * signers.
 */
async function archiveSignedAgreement(
  db: SupabaseClient,
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
  // authorization (allowlisted pattern, see docs/SECURITY.md).
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
