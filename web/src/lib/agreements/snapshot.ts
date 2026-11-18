import { createHash } from "node:crypto";
import { renderAgreementBody, templateNeedsFeeTerms, templatePlaceholders, unsupportedPlaceholders, type AgreementVars } from "./render";
import { formatCents, renderFeeTermsSection, type InstallmentLine } from "./schedule";
import { formatLongDate } from "../proposals/terms";

export interface AgreementFeeTerms {
  totalFeeCents: number;
  retainerCents: number;
  lines: InstallmentLine[];
}

export interface AgreementTemplateSource {
  id: string | null;
  name: string;
  body: string;
}

export interface PreparedAgreementDocument {
  templateId: string | null;
  title: string;
  body: string;
  documentHash: string;
}

/** Preview and sending share the exact renderer and hash, including fee terms. */
export function prepareAgreementDocument(input: {
  template: AgreementTemplateSource;
  familyName: string;
  firmName: string;
  todayIso: string;
  feeTerms: AgreementFeeTerms | null;
  /** Trusted engagement details; never a client-supplied document body. */
  engagement?: Partial<AgreementVars>;
}): { document: PreparedAgreementDocument } | { error: string } {
  const { template, feeTerms } = input;
  const keys = templatePlaceholders(template.body);
  const unknown = unsupportedPlaceholders(template.body);
  if (unknown.length) return {
    error: `This template uses unsupported placeholder${unknown.length === 1 ? "" : "s"} ` +
      unknown.map((key) => `{{${key}}}`).join(", ") + " — edit the template in Settings first",
  };
  if (!feeTerms && templateNeedsFeeTerms(template.body)) return {
    error: "This template includes the fee placeholders — enter the fee terms to send it",
  };
  const values: AgreementVars = {
    ...input.engagement,
    family_name: input.familyName,
    firm_name: input.firmName,
    date: formatLongDate(input.todayIso),
    year: input.todayIso.slice(0, 4),
    total_fee: feeTerms ? formatCents(feeTerms.totalFeeCents) : undefined,
    deposit_fee: feeTerms ? formatCents(feeTerms.retainerCents) : undefined,
    remaining_fee: feeTerms ? formatCents(feeTerms.totalFeeCents - feeTerms.retainerCents) : undefined,
    half_fee: feeTerms ? formatCents(Math.round(feeTerms.totalFeeCents / 2)) : undefined,
    payment_schedule: feeTerms ? renderFeeTermsSection(feeTerms.totalFeeCents, feeTerms.lines).trim() : undefined,
  };
  const missing = keys.filter((key) => key !== "retainer" && values[key as keyof AgreementVars] === undefined);
  if (missing.length) return { error: `Complete the agreement details before previewing: ${missing.map((key) => `{{${key}}}`).join(", ")}. These fields require an accepted proposal and any dates requested in the agreement setup.` };
  let body = renderAgreementBody(template.body, values);
  if (input.engagement) {
    const details: string[] = [];
    if (!keys.includes("student_name") && values.student_name) details.push(`Student: ${values.student_name}${values.graduation_year ? `, Class of ${values.graduation_year}` : ""}.`);
    if (!keys.includes("services") && values.services) details.push("### Included services", values.services);
    if (!keys.includes("test_preparation") && values.test_preparation) details.push("### Test preparation", values.test_preparation);
    if (details.length) body += ["", "", "## Engagement details", "", ...details.flatMap((line) => [line, ""])].join("\n");
  }
  if (feeTerms && !keys.includes("payment_schedule")) body += renderFeeTermsSection(feeTerms.totalFeeCents, feeTerms.lines);
  return { document: {
    templateId: template.id, title: template.name, body,
    documentHash: createHash("sha256").update(body, "utf8").digest("hex"),
  } };
}

/** Binds review to the document, destination and proposal version, not client text. */
export function proposalAgreementReviewToken(input: {
  documentHash: string;
  documentTitle: string;
  templateId: string | null;
  proposalId: string;
  proposalUpdatedAt: string;
  familyMode: "new" | "existing";
  familyId: string | null;
  familyName: string;
  recipientEmail: string;
}): string {
  return createHash("sha256").update(JSON.stringify([
    input.documentHash, input.documentTitle, input.templateId, input.proposalId, input.proposalUpdatedAt,
    input.familyMode, input.familyId, input.familyName, input.recipientEmail.toLowerCase(),
  ]), "utf8").digest("hex");
}
