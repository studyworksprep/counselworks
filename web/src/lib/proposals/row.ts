import type { InstallmentLine } from "../agreements/schedule";
import type {
  ApprovalSource,
  PaymentStructure,
  ProposalStatus,
} from "../constants/proposals";
import { parseStoredSchedule } from "./schedule";
import type { ProposalTermsSource } from "./terms";

/**
 * The proposals row as staff code reads it, and its mappings. Shared by the
 * authorization helper, the staff queries, the actions, and the public
 * loader so one explicit select list (no `select('*')`) defines what leaves
 * the table.
 */

export interface ProposalRow {
  id: string;
  firm_id: string;
  status: ProposalStatus;
  parent_first_name: string;
  parent_last_name: string;
  parent_email: string;
  student_first_name: string;
  student_last_name: string;
  graduation_year: number;
  title: string;
  intro_message: string | null;
  services_summary: string;
  total_cost_cents: number;
  discount_percent: number;
  discounted_cost_cents: number;
  payment_structure: string;
  deposit_cents: number | null;
  installment_count: number | null;
  first_due_on: string | null;
  payment_schedule_json: unknown;
  test_prep_lessons: number | null;
  additional_session_rate_cents: number | null;
  terms_and_conditions: string | null;
  valid_until: string;
  public_token: string | null;
  sent_at: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  approved_via: ApprovalSource | null;
  withdrawn_at: string | null;
  family_id: string | null;
  agreement_id: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export const PROPOSAL_COLUMNS =
  "id, firm_id, status, parent_first_name, parent_last_name, parent_email, " +
  "student_first_name, student_last_name, graduation_year, title, intro_message, " +
  "services_summary, total_cost_cents, discount_percent, discounted_cost_cents, " +
  "payment_structure, deposit_cents, installment_count, first_due_on, " +
  "payment_schedule_json, test_prep_lessons, additional_session_rate_cents, " +
  "terms_and_conditions, valid_until, public_token, sent_at, approved_at, " +
  "approved_by_name, approved_via, withdrawn_at, family_id, agreement_id, " +
  "created_by_user_id, created_at, updated_at";

/** The linked service agreement, as embedded by PostgREST. */
export interface LinkedAgreement {
  id: string;
  status: string;
  family_id: string;
}

export const LINKED_AGREEMENT_EMBED =
  "service_agreements:agreement_id(id, status, family_id)";

/** PostgREST hands an embedded to-one row back as an object or a 1-array. */
export function unwrapLinkedAgreement(value: unknown): LinkedAgreement | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const a = row as Record<string, unknown>;
  if (typeof a.id !== "string" || typeof a.status !== "string") return null;
  return { id: a.id, status: a.status, family_id: String(a.family_id) };
}

/**
 * numeric(5,2) can arrive as a number or a string depending on the driver;
 * every reader goes through this so "10.00" and 10 are the same discount.
 */
export function normalizeProposalRow<T extends ProposalRow>(row: T): T {
  return { ...row, discount_percent: Number(row.discount_percent) };
}

export function parentFullName(p: {
  parent_first_name: string;
  parent_last_name: string;
}): string {
  return `${p.parent_first_name} ${p.parent_last_name}`;
}

export function studentFullName(p: {
  student_first_name: string;
  student_last_name: string;
}): string {
  return `${p.student_first_name} ${p.student_last_name}`;
}

/**
 * Everything a reader is shown of a proposal — the staff preview and the
 * public page render the same `ProposalDocument` from this, and it carries
 * nothing that is not meant for the prospect (no ids, no token, no author
 * id, no approval bookkeeping).
 */
export interface ProposalView {
  title: string;
  parentFirstName: string;
  parentName: string;
  studentName: string;
  graduationYear: number;
  introMessage: string | null;
  servicesSummary: string;
  totalCostCents: number;
  discountPercent: number;
  discountedCostCents: number;
  paymentStructure: PaymentStructure;
  /** Empty only if the stored schedule is unreadable (rendered as such). */
  lines: InstallmentLine[];
  testPrepLessons: number | null;
  additionalSessionRateCents: number | null;
  termsAndConditions: string | null;
  validUntil: string;
}

type ViewColumns = Pick<
  ProposalRow,
  | "title"
  | "parent_first_name"
  | "parent_last_name"
  | "student_first_name"
  | "student_last_name"
  | "graduation_year"
  | "intro_message"
  | "services_summary"
  | "total_cost_cents"
  | "discount_percent"
  | "discounted_cost_cents"
  | "payment_structure"
  | "payment_schedule_json"
  | "test_prep_lessons"
  | "additional_session_rate_cents"
  | "terms_and_conditions"
  | "valid_until"
>;

export function toProposalView(row: ViewColumns): ProposalView {
  return {
    title: row.title,
    parentFirstName: row.parent_first_name,
    parentName: parentFullName(row),
    studentName: studentFullName(row),
    graduationYear: row.graduation_year,
    introMessage: row.intro_message,
    servicesSummary: row.services_summary,
    totalCostCents: row.total_cost_cents,
    discountPercent: Number(row.discount_percent),
    discountedCostCents: row.discounted_cost_cents,
    paymentStructure: row.payment_structure as PaymentStructure,
    lines: parseStoredSchedule(row.payment_schedule_json) ?? [],
    testPrepLessons: row.test_prep_lessons,
    additionalSessionRateCents: row.additional_session_rate_cents,
    termsAndConditions: row.terms_and_conditions,
    validUntil: row.valid_until,
  };
}

/** The canonical-terms input for a view (fingerprint + agreement embed). */
export function toTermsSource(view: ProposalView): ProposalTermsSource {
  return {
    title: view.title,
    parentName: view.parentName,
    studentName: view.studentName,
    graduationYear: view.graduationYear,
    servicesSummary: view.servicesSummary,
    totalCostCents: view.totalCostCents,
    discountPercent: view.discountPercent,
    discountedCostCents: view.discountedCostCents,
    lines: view.lines,
    testPrepLessons: view.testPrepLessons,
    additionalSessionRateCents: view.additionalSessionRateCents,
    termsAndConditions: view.termsAndConditions,
    validUntil: view.validUntil,
  };
}
