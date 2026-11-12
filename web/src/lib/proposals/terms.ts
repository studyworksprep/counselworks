import { format, parseISO } from "date-fns";
import {
  formatCents,
  type InstallmentLine,
} from "../agreements/schedule";
import { formatPercent } from "./pricing";

/**
 * Proposal wording: the starter text a new proposal opens with, and the
 * canonical rendering of a proposal's terms. Pure and unit-tested in
 * tests/unit/proposals.test.ts.
 *
 * The canonical text is light markdown in the agreement subset
 * (src/lib/agreements/markdown.ts) and serves two jobs:
 *   1. its fingerprint is what a client approves — the public page binds it
 *      into the approve action, so a proposal edited after the client
 *      opened it cannot be approved sight unseen;
 *   2. it is embedded verbatim in the service agreement created from an
 *      approved proposal, so the accepted terms become part of the text
 *      both parties sign.
 *
 * Keep it to characters the signed-agreement PDF can draw (WinAnsi): plain
 * hyphens for negative amounts, no arrows or other symbols.
 */

export const DEFAULT_PROPOSAL_TITLE = "College Counseling Proposal";

/** Starter "what's included" list; the counselor edits it per client. */
export const DEFAULT_SERVICES_SUMMARY = [
  "- Personalized college list and admissions strategy",
  "- Application timeline and deadline management",
  "- Essay brainstorming and feedback on the personal statement and supplements",
  "- Activities list and resume review",
  "- Interview preparation",
  "- Financial aid and scholarship guidance",
  "- Regular check-ins with the student and family through the application season",
].join("\n");

/**
 * Starter terms & conditions. These are common independent-counseling
 * terms offered as a starting point, not legal advice — the form says so
 * and every firm is expected to edit them to match its own policies and
 * its service agreement.
 */
export function defaultTermsAndConditions(opts: {
  includesTestPrep: boolean;
}): string {
  const clauses = [
    "**Proposal validity.** The fees and any discount in this proposal are held until the valid-through date shown below.",
    "**Start of services.** Approving this proposal is not a binding contract. Services begin once both parties have signed the service agreement and the first payment has been received.",
    "**Payments.** Payments are due on the dates in the payment schedule. If a payment is more than 14 days late, services may be paused until the account is current.",
    "**Cancellation and refunds.** Either party may end the engagement with written notice. The first payment is non-refundable; refunds of any other prepaid fees are governed by the service agreement.",
    "**No guarantee of admission.** We provide guidance and advocacy, but admission decisions are made solely by the colleges. No admission, scholarship, or financial aid outcome is promised or guaranteed.",
    "**The student's own work.** All essays and application materials must be the student's own work. We brainstorm, advise, and give feedback; we do not write or submit applications on the student's behalf.",
    "**Family responsibilities.** Results depend on timely participation. The student and family agree to meet agreed deadlines, attend scheduled meetings, and provide accurate information.",
    "**Costs not included.** Third-party costs such as application fees, test registration fees, score reports, and financial aid form fees are paid directly by the family and are not part of these fees.",
  ];
  if (opts.includesTestPrep) {
    clauses.push(
      "**Test preparation lessons.** Included lessons must be used before the student's final application is submitted. A lesson cancelled with less than 24 hours' notice counts as used. Unused lessons have no cash value and are not refundable or transferable."
    );
  }
  clauses.push(
    "**Confidentiality.** Information shared by the family is kept confidential and used only to provide these services."
  );
  return clauses.map((clause, i) => `${i + 1}. ${clause}`).join("\n");
}

/** Everything the canonical terms text is rendered from. */
export interface ProposalTermsSource {
  title: string;
  parentName: string;
  studentName: string;
  graduationYear: number;
  servicesSummary: string;
  totalCostCents: number;
  discountPercent: number;
  discountedCostCents: number;
  lines: InstallmentLine[];
  testPrepLessons: number | null;
  additionalSessionRateCents: number | null;
  termsAndConditions: string | null;
  /** YYYY-MM-DD. */
  validUntil: string;
}

/** "December 12, 2026" from YYYY-MM-DD. */
export function formatLongDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMMM d, yyyy");
}

/** The fee lines: list price, discount, and what the client pays. */
export function feeSummaryLines(p: {
  totalCostCents: number;
  discountPercent: number;
  discountedCostCents: number;
}): string[] {
  if (p.discountedCostCents === p.totalCostCents) {
    return [`Total: ${formatCents(p.totalCostCents)}`];
  }
  return [
    `Program fee: ${formatCents(p.totalCostCents)}`,
    `Discount (${formatPercent(p.discountPercent)}): -${formatCents(
      p.totalCostCents - p.discountedCostCents
    )}`,
    `Total after discount: ${formatCents(p.discountedCostCents)}`,
  ];
}

/** The test-preparation lines, empty when no lessons are included. */
export function testPrepLines(p: {
  testPrepLessons: number | null;
  additionalSessionRateCents: number | null;
}): string[] {
  if (!p.testPrepLessons) return [];
  const lines = [
    `${p.testPrepLessons} test preparation lesson${
      p.testPrepLessons === 1 ? " is" : "s are"
    } included at no additional charge.`,
  ];
  if (p.additionalSessionRateCents) {
    lines.push(
      `Additional sessions after the included lessons are used: ${formatCents(
        p.additionalSessionRateCents
      )} per session.`
    );
  }
  return lines;
}

/** "1. Deposit (due at signing): $2,000.00" / "…: $1,100.00 — due March 1, 2027". */
function scheduleLineText(line: InstallmentLine): string {
  const due = line.dueOn ? ` — due ${formatLongDate(line.dueOn)}` : "";
  return `${line.label}: ${formatCents(line.amountCents)}${due}`;
}

/**
 * The canonical terms text.
 *
 * `includeSchedule: false` drops the payment schedule — used when the terms
 * are embedded in a service agreement, where the agreement's own fee
 * section (rendered from the very same lines) follows immediately and
 * printing the schedule twice would invite the two copies to be compared.
 */
export function renderProposalTerms(
  p: ProposalTermsSource,
  opts: { includeSchedule?: boolean; heading?: string } = {}
): string {
  const includeSchedule = opts.includeSchedule ?? true;
  const out: string[] = [
    `## ${opts.heading ?? p.title}`,
    "",
    `Prepared for ${p.parentName}. Student: ${p.studentName}, Class of ${p.graduationYear}.`,
    "",
    "### Services",
    "",
    p.servicesSummary.trim(),
    "",
    "### Fees",
    "",
    ...feeSummaryLines(p).map((line) => `- ${line}`),
  ];

  if (includeSchedule) {
    out.push(
      "",
      "### Payment schedule",
      "",
      ...p.lines.map((line, i) => `${i + 1}. ${scheduleLineText(line)}`)
    );
  }

  const testPrep = testPrepLines(p);
  if (testPrep.length > 0) {
    out.push("", "### Test preparation", "", ...testPrep.map((line) => `- ${line}`));
  }

  const terms = p.termsAndConditions?.trim();
  if (terms) {
    out.push("", "### Terms and conditions", "", terms);
  }

  out.push("", `This proposal is valid through ${formatLongDate(p.validUntil)}.`);
  return out.join("\n");
}

/**
 * The block appended to a service agreement created from an approved
 * proposal (before the agreement's own fee & payment-schedule section, and
 * before hashing — it is part of what both parties sign).
 */
export function renderAgreementProposalSection(
  p: ProposalTermsSource,
  approval: { approvedByName: string | null; approvedOn: string | null }
): string {
  const accepted =
    approval.approvedByName && approval.approvedOn
      ? `The following proposal was accepted by ${approval.approvedByName} on ${formatLongDate(
          approval.approvedOn
        )} and forms part of this agreement.`
      : "The following accepted proposal forms part of this agreement.";
  return [
    "",
    "----------------------------------------",
    accepted,
    "",
    renderProposalTerms(p, {
      includeSchedule: false,
      heading: `Accepted proposal: ${p.title}`,
    }),
    "",
  ].join("\n");
}
