import "server-only";
import { createServerClient } from "../db/client";
import { firmTodayIso } from "../tasks/recurrence";
import { isValidProposalToken } from "./links";
import { termsFingerprint } from "./fingerprint";
import { renderProposalTerms } from "./terms";
import { hasActiveAgreement, isProposalExpired } from "./status";
import {
  toProposalView,
  toTermsSource,
  unwrapLinkedAgreement,
  type ProposalView,
} from "./row";

/**
 * Public proposal-link loader.
 *
 * Service-role client (allowlisted, see docs/SECURITY.md): the prospective
 * client opens /proposal/<token> with no session and no account — they are
 * not a user of the firm at all yet — so there is nobody to scope a client
 * with, and RLS on `proposals` is staff-only by design. Authorization is
 * the secret 48-hex token itself (unguessable, unique, revoked on
 * withdraw). Everything the page and its approve action touch is loaded
 * from the ONE proposal that token resolves to and explicitly scoped by
 * that proposal's own firm_id; nothing here accepts a caller-supplied firm,
 * proposal, or family id. Only fields meant for the prospect are selected.
 */

export interface ProposalLinkContext {
  token: string;
  proposalId: string;
  firmId: string;
  /** The proposal's author — who an approval notifies. */
  authorUserId: string;
  /** Only live proposals resolve: drafts and withdrawn ones have no token. */
  status: "sent" | "approved" | "rejected";
  /** Row version, for the approve action's conditional update. */
  updatedAt: string;
  view: ProposalView;
  /** SHA-256 of the canonical terms as they stand right now. */
  termsFingerprint: string;
  /** Firm-local calendar date. */
  todayIso: string;
  /** Sent, and past its valid-through date. */
  expired: boolean;
  /** Firm-local calendar date (YYYY-MM-DD) the proposal was approved on. */
  approvedOn: string | null;
  rejectedOn: string | null;
  rejectionComment: string | null;
  /** A (non-voided) service agreement has been created from this proposal. */
  agreementIssued: boolean;
  parentEmail: string;
  firm: { name: string; primaryColor: string | null; logoUrl: string | null };
  /** The counselor to contact with questions. */
  author: { firstName: string; name: string; email: string } | null;
}

const PUBLIC_PROPOSAL_SELECT =
  "id, firm_id, status, updated_at, created_by_user_id, parent_email, " +
  "parent_first_name, parent_last_name, student_first_name, student_last_name, " +
  "graduation_year, title, intro_message, services_summary, total_cost_cents, " +
  "discount_percent, discounted_cost_cents, payment_structure, " +
  "payment_schedule_json, test_prep_lessons, additional_session_rate_cents, " +
  "terms_and_conditions, valid_until, approved_at, rejected_at, rejection_comment, " +
  "service_agreements:agreement_id(id, status, family_id), " +
  "firms:firm_id(name, timezone)";

interface PublicProposalRow {
  id: string;
  firm_id: string;
  status: string;
  updated_at: string;
  created_by_user_id: string;
  parent_email: string;
  parent_first_name: string;
  parent_last_name: string;
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
  payment_schedule_json: unknown;
  test_prep_lessons: number | null;
  additional_session_rate_cents: number | null;
  terms_and_conditions: string | null;
  valid_until: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_comment: string | null;
  service_agreements: unknown;
  firms:
    | { name: string; timezone: string | null }
    | { name: string; timezone: string | null }[]
    | null;
}

export async function loadProposalLink(
  token: string
): Promise<ProposalLinkContext | null> {
  // Reject junk before touching the database (same as the signing link).
  if (!isValidProposalToken(token)) return null;

  const db = createServerClient();
  const { data } = await db
    .from("proposals")
    .select(PUBLIC_PROPOSAL_SELECT)
    .eq("public_token", token)
    .maybeSingle();
  const row = data as unknown as PublicProposalRow | null;
  // Withdrawing clears the token, but belt-and-braces: only a proposal
  // that is out with the client ever resolves.
  if (!row || !["sent", "approved", "rejected"].includes(row.status)) return null;

  const [{ data: settings }, { data: author }] = await Promise.all([
    db
      .from("firm_settings")
      .select("primary_color, branding_logo_url")
      .eq("firm_id", row.firm_id)
      .maybeSingle(),
    db
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", row.created_by_user_id)
      .maybeSingle(),
  ]);

  const firm = (Array.isArray(row.firms) ? row.firms[0] : row.firms) ?? null;
  const timezone = firm?.timezone || "America/New_York";
  const todayIso = firmTodayIso(Date.now(), timezone);
  const view = toProposalView(row);

  return {
    token,
    proposalId: row.id,
    firmId: row.firm_id,
    authorUserId: row.created_by_user_id,
    status: row.status as ProposalLinkContext["status"],
    updatedAt: row.updated_at,
    view,
    termsFingerprint: termsFingerprint(renderProposalTerms(toTermsSource(view))),
    todayIso,
    expired: isProposalExpired(row, todayIso),
    approvedOn: row.approved_at
      ? firmTodayIso(Date.parse(row.approved_at), timezone)
      : null,
    rejectedOn: row.rejected_at
      ? firmTodayIso(Date.parse(row.rejected_at), timezone)
      : null,
    rejectionComment: row.rejection_comment,
    agreementIssued: hasActiveAgreement(
      unwrapLinkedAgreement(row.service_agreements)?.status
    ),
    parentEmail: row.parent_email,
    firm: {
      name: firm?.name ?? "Your counseling firm",
      primaryColor: (settings?.primary_color as string | null) ?? null,
      logoUrl: (settings?.branding_logo_url as string | null) ?? null,
    },
    author: author
      ? {
          firstName: author.first_name,
          name: `${author.first_name} ${author.last_name}`.trim(),
          email: author.email,
        }
      : null,
  };
}
