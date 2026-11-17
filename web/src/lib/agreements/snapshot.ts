import { createHash } from "node:crypto";
import { renderAgreementBody, templateNeedsFeeTerms, unsupportedPlaceholders } from "./render";
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
  appendix?: string;
}): { document: PreparedAgreementDocument } | { error: string } {
  const { template, feeTerms } = input;
  const unknown = unsupportedPlaceholders(template.body);
  if (unknown.length) return {
    error: `This template uses unsupported placeholder${unknown.length === 1 ? "" : "s"} ` +
      unknown.map((key) => `{{${key}}}`).join(", ") + " — edit the template in Settings first",
  };
  if (!feeTerms && templateNeedsFeeTerms(template.body)) return {
    error: "This template includes the fee placeholders — enter the fee terms to send it",
  };
  let body = renderAgreementBody(template.body, {
    family_name: input.familyName,
    firm_name: input.firmName,
    date: formatLongDate(input.todayIso),
    year: input.todayIso.slice(0, 4),
    total_fee: feeTerms ? formatCents(feeTerms.totalFeeCents) : undefined,
    deposit_fee: feeTerms ? formatCents(feeTerms.retainerCents) : undefined,
  });
  if (input.appendix) body += input.appendix;
  if (feeTerms) body += renderFeeTermsSection(feeTerms.totalFeeCents, feeTerms.lines);
  return { document: {
    templateId: template.id, title: template.name, body,
    documentHash: createHash("sha256").update(body, "utf8").digest("hex"),
  } };
}

/** A small wrapper around the firm's already-authored proposal, without new policies. */
export function proposalAgreementTemplate(proposalTitle: string): AgreementTemplateSource {
  return {
    id: null,
    name: `Service agreement: ${proposalTitle}`,
    body: [
      "## Service agreement", "",
      "Prepared on {{date}} for {{family_name}} and {{firm_name}}.", "",
      "This service agreement incorporates the accepted proposal below, including its services, program details, fees, and selected payment schedule.", "",
      "Approving the proposal did not sign a contract. This service agreement is provided separately for both parties to review and sign.",
    ].join("\n"),
  };
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
