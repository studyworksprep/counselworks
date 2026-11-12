import type {
  ProposalDisplayStatus,
  ProposalStatus,
} from "../constants/proposals";

/**
 * Pure proposal lifecycle rules, unit-tested in tests/unit/proposals.test.ts.
 * One place decides what a proposal shows and what may be done to it, for
 * the staff pages, the public page, and every action.
 *
 * `todayIso` is always the FIRM-local calendar date (firms.timezone via
 * firmTodayIso): "valid through December 12" means the firm's December 12.
 */

/** A sent proposal whose valid-through date has passed. Derived, never stored. */
export function isProposalExpired(
  p: { status: string; valid_until: string },
  todayIso: string
): boolean {
  return p.status === "sent" && p.valid_until < todayIso;
}

/**
 * What the row shows: the stored status, refined by expiry and by the
 * linked service agreement (voided agreements don't count — the proposal
 * is simply approved again and another agreement can be created).
 */
export function proposalDisplayStatus(
  p: {
    status: string;
    valid_until: string;
    agreement_status?: string | null;
  },
  todayIso: string
): ProposalDisplayStatus {
  if (p.status === "approved") {
    if (p.agreement_status === "completed") return "agreement_completed";
    if (p.agreement_status && p.agreement_status !== "voided") {
      return "agreement_sent";
    }
    return "approved";
  }
  if (isProposalExpired(p, todayIso)) return "expired";
  return p.status as ProposalStatus;
}

/**
 * Terms can change until the client approves; after that the proposal is
 * the record of what was accepted and is frozen (duplicate it to revise).
 */
export function proposalEditable(status: string): boolean {
  return status === "draft" || status === "sent";
}

/** A live agreement already carries this proposal's terms. */
export function hasActiveAgreement(agreementStatus: string | null | undefined): boolean {
  return !!agreementStatus && agreementStatus !== "voided";
}

/** Why the client can't approve from the public link right now, or null. */
export function approvalProblem(
  p: { status: string; valid_until: string },
  todayIso: string
): string | null {
  if (p.status === "approved") return "This proposal has already been approved";
  if (p.status !== "sent") return "This proposal is no longer available";
  if (isProposalExpired(p, todayIso)) {
    return "This proposal has expired — please contact us for an updated one";
  }
  return null;
}

/** Why a service agreement can't be created from this proposal, or null. */
export function conversionProblem(p: {
  status: string;
  agreement_status?: string | null;
}): string | null {
  if (p.status !== "approved") {
    return "Only an approved proposal can become a service agreement";
  }
  if (hasActiveAgreement(p.agreement_status)) {
    return "A service agreement has already been created from this proposal";
  }
  return null;
}

/** Withdrawing revokes the public link; pointless once an agreement is out. */
export function withdrawProblem(p: {
  status: string;
  agreement_status?: string | null;
}): string | null {
  if (p.status !== "sent" && p.status !== "approved") {
    return "Only a sent or approved proposal can be withdrawn";
  }
  if (hasActiveAgreement(p.agreement_status)) {
    return "This proposal already has a service agreement — void the agreement instead";
  }
  return null;
}
