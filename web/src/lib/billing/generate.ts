import { createServerClient } from "../db/client";
import { recordAuditEvent } from "../audit";
import { uploadFile, getStoragePath, BUCKET_DOCUMENTS } from "../storage";
import { renderInvoicePdf } from "./pdf";
import { invoiceDueOn, nextInvoiceNumbers } from "./invoices";

/**
 * Generate the per-installment invoices for a fully executed agreement
 * (fix plan 12.3): one invoice per installment (retainer due on the
 * execution date), each with an immutable PDF archived family-visible in
 * Documents. Idempotent — installments that already have an invoice are
 * skipped (UNIQUE installment_id backstops races), and an invoice whose
 * PDF step previously failed gets its document backfilled on re-run.
 *
 * Service-role client (allowlisted, see docs/SECURITY.md): invoice
 * generation runs inside the completing signature request, and the
 * completing signer is often the parent — a portal role that deliberately
 * holds no write privileges on money tables under RLS. Authorization is
 * the two recorded signatures on the agreement (verified `completed`
 * below), not the caller's own role; every query stays explicitly
 * firm-scoped.
 */
export async function generateInvoicesForAgreement(input: {
  firmId: string;
  agreementId: string;
  /** The completing signer; recorded as the documents uploader. */
  actorUserId: string;
}): Promise<{ created: number } | { error: string }> {
  const db = createServerClient();

  const { data: agreement } = await db
    .from("service_agreements")
    .select(
      "id, family_id, title, status, completed_at, total_fee_cents, families:family_id(household_name)"
    )
    .eq("id", input.agreementId)
    .eq("firm_id", input.firmId)
    .maybeSingle();
  if (!agreement) return { error: "Agreement not found" };
  if (agreement.status !== "completed") {
    return { error: "Agreement is not fully executed" };
  }
  // Fee-less agreements have no installments and nothing to invoice.
  if (agreement.total_fee_cents === null) return { created: 0 };

  const family = (
    Array.isArray(agreement.families) ? agreement.families[0] : agreement.families
  ) as { household_name: string } | null;

  const [{ data: installments }, { data: existing }, { data: firm }] =
    await Promise.all([
      db
        .from("agreement_installments")
        .select("id, installment_number, label, amount_cents, is_retainer, due_on")
        .eq("firm_id", input.firmId)
        .eq("agreement_id", agreement.id)
        .order("installment_number", { ascending: true }),
      db
        .from("invoices")
        .select("installment_id, id, document_id, invoice_number, amount_cents, due_on")
        .eq("firm_id", input.firmId)
        .eq("agreement_id", agreement.id),
      db.from("firms").select("name").eq("id", input.firmId).maybeSingle(),
    ]);

  const executedOn = (agreement.completed_at ?? new Date().toISOString()).slice(
    0,
    10
  );
  const firmName = firm?.name ?? "CounselWorks firm";
  const familyName = family?.household_name ?? "Family";
  const byInstallment = new Map((existing ?? []).map((e) => [e.installment_id, e]));
  const pending = (installments ?? []).filter((i) => !byInstallment.has(i.id));

  async function archivePdf(invoice: {
    id: string;
    invoice_number: string;
    amount_cents: number;
    due_on: string;
    label: string;
  }): Promise<void> {
    const pdfBytes = await renderInvoicePdf({
      firmName,
      invoiceNumber: invoice.invoice_number,
      familyName,
      agreementTitle: agreement!.title,
      installmentLabel: invoice.label,
      amountCents: invoice.amount_cents,
      issuedOn: executedOn,
      dueOn: invoice.due_on,
    });
    const fileName = `invoice-${invoice.invoice_number}-${invoice.id}.pdf`;
    const storageKey = getStoragePath(
      input.firmId,
      "family",
      agreement!.family_id,
      fileName
    );
    await uploadFile(
      BUCKET_DOCUMENTS,
      storageKey,
      new Blob([pdfBytes as BlobPart], { type: "application/pdf" })
    );
    const { data: doc } = await db
      .from("documents")
      .insert({
        firm_id: input.firmId,
        family_id: agreement!.family_id,
        category: "invoice",
        title: `Invoice ${invoice.invoice_number} — ${invoice.label}`,
        storage_key: storageKey,
        mime_type: "application/pdf",
        file_size_bytes: pdfBytes.byteLength,
        // Deliberate audience decision: invoices are the family's bills —
        // always family-visible, like the signed agreement itself.
        visibility_scope: "family",
        uploaded_by_user_id: input.actorUserId,
      })
      .select("id")
      .single();
    if (doc) {
      await db
        .from("invoices")
        .update({ document_id: doc.id })
        .eq("id", invoice.id)
        .eq("firm_id", input.firmId);
    }
  }

  // Backfill PDFs for invoices whose document step failed on a prior run.
  for (const orphan of (existing ?? []).filter((e) => !e.document_id)) {
    const installment = (installments ?? []).find(
      (i) => i.id === orphan.installment_id
    );
    if (!installment) continue;
    await archivePdf({
      id: orphan.id,
      invoice_number: orphan.invoice_number,
      amount_cents: orphan.amount_cents,
      due_on: orphan.due_on,
      label: installment.label,
    });
  }

  if (pending.length === 0) return { created: 0 };

  let created = 0;
  let remaining = pending;
  // Two passes: a (firm_id, invoice_number) collision from a concurrent
  // generation in the same firm gets one renumbered retry of what's left.
  for (let attempt = 1; attempt <= 2 && remaining.length > 0; attempt++) {
    const { data: numberRows } = await db
      .from("invoices")
      .select("invoice_number")
      .eq("firm_id", input.firmId);
    const numbers = nextInvoiceNumbers(
      (numberRows ?? []).map((r) => r.invoice_number),
      remaining.length
    );

    const unfinished: typeof remaining = [];
    let collided = false;
    for (let i = 0; i < remaining.length; i++) {
      const installment = remaining[i];
      if (collided) {
        unfinished.push(installment);
        continue;
      }
      const dueOn = invoiceDueOn(installment, executedOn);
      const { data: invoice, error } = await db
        .from("invoices")
        .insert({
          firm_id: input.firmId,
          family_id: agreement.family_id,
          agreement_id: agreement.id,
          installment_id: installment.id,
          invoice_number: numbers[i],
          amount_cents: installment.amount_cents,
          status: "open",
          due_on: dueOn,
        })
        .select("id, invoice_number")
        .single();
      if (error) {
        if (error.code === "23505") {
          if (String(error.message).includes("installment_id")) {
            continue; // invoiced concurrently — already done, no PDF needed here
          }
          collided = true; // number collision: renumber the rest next pass
          unfinished.push(installment);
          continue;
        }
        return { error: `Failed to create invoice: ${error.message}` };
      }
      await archivePdf({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        amount_cents: installment.amount_cents,
        due_on: dueOn,
        label: installment.label,
      });
      created++;
    }
    remaining = unfinished;
  }
  if (remaining.length > 0) {
    return { error: "Invoice numbering conflicted twice — re-run generation" };
  }

  if (created > 0) {
    await recordAuditEvent(db, {
      firmId: input.firmId,
      actorUserId: input.actorUserId,
      entityType: "service_agreement",
      entityId: agreement.id,
      actionType: "invoices_generated",
      label: `${created} invoice${created === 1 ? "" : "s"} generated for ${familyName}`,
    });
  }
  return { created };
}
