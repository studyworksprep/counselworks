import { appBaseUrl, isValidSigningToken } from "../agreements/links";

/**
 * Public proposal-link helpers, pure and unit-tested in
 * tests/unit/proposals.test.ts. The token is the same shape as the
 * agreement signing token (48 hex chars from 24 random bytes) and is
 * validated by the same pattern.
 */

export const isValidProposalToken = isValidSigningToken;

/** Path of the public proposal page for a token. */
export function proposalLinkPath(token: string): string {
  return `/proposal/${token}`;
}

/** Absolute proposal URL for the email and the staff "copy link" control. */
export function proposalLinkUrl(token: string): string {
  return `${appBaseUrl()}${proposalLinkPath(token)}`;
}

/** Absolute URL of the staff detail page, for the approval email to staff. */
export function staffProposalUrl(proposalId: string): string {
  return `${appBaseUrl()}/proposals/${proposalId}`;
}
