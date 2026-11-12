"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "../db/client";
import { recordAuditEvent } from "../audit";
import { loadProposalLink } from "../proposals/public-link";
import { approvalProblem } from "../proposals/status";
import { proposalLinkPath, staffProposalUrl } from "../proposals/links";
import { sendProposalApprovedStaffEmail } from "../email";
import type { ApprovalSource, ProposalStatus } from "../constants/proposals";

/**
 * Token-authorized proposal approval: the prospective client approves from
 * the public link with no login. Service-role client (allowlisted, see
 * docs/SECURITY.md) for the same reason as the loader — there is no user
 * session, and the approver is not a user of the firm at all yet. The
 * action re-resolves the token through loadProposalLink and acts only on
 * that one proposal; nothing accepts an id the token did not produce.
 *
 * Approval is deliberately light (a typed name and a confirmation): it is
 * the client's go-ahead, not the contract. The binding step is the service
 * agreement created from the proposal, which runs the full e-signature
 * flow with consent and an audit trail.
 */
export async function approveProposalByToken(
  token: string,
  /**
   * Fingerprint of the terms that were on the client's screen, bound into
   * the action when the page rendered. A proposal edited since then has a
   * different fingerprint and is not approved sight unseen.
   */
  displayedTermsFingerprint: string,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const approvedByName = ((formData.get("approved_by_name") as string) || "").trim();
  if (!approvedByName) return { error: "Type your full name to approve" };
  if (approvedByName.length > 120) return { error: "That name is too long" };
  if (formData.get("confirm") !== "on") {
    return { error: "Please confirm that you approve this proposal" };
  }

  const link = await loadProposalLink(token);
  if (!link) return { error: "This proposal link is no longer valid" };
  const problem = approvalProblem(
    { status: link.status, valid_until: link.view.validUntil },
    link.todayIso
  );
  if (problem) return { error: problem };
  if (displayedTermsFingerprint !== link.termsFingerprint) {
    // Repaint with the current terms so the next approval is of what the
    // client can actually see.
    revalidatePath(proposalLinkPath(token));
    return {
      error:
        "This proposal was updated after you opened it. Please review the current version below, then approve.",
    };
  }

  const db = createServerClient();
  // Conditional on status AND row version: a concurrent edit, withdrawal,
  // or second approval between the load above and this write matches zero
  // rows instead of approving something the client did not read.
  const { data: updated, error } = await db
    .from("proposals")
    .update({
      status: "approved" satisfies ProposalStatus,
      approved_at: new Date().toISOString(),
      approved_by_name: approvedByName,
      approved_via: "link" satisfies ApprovalSource,
    })
    .eq("id", link.proposalId)
    .eq("firm_id", link.firmId)
    .eq("public_token", token)
    .eq("status", "sent")
    .eq("updated_at", link.updatedAt)
    .select("id");
  if (error) {
    console.error("Proposal approval failed:", error);
    return { error: "We couldn't record your approval — please try again" };
  }
  if (!updated || updated.length === 0) {
    revalidatePath(proposalLinkPath(token));
    return {
      error:
        "This proposal changed while you were approving. Please review it and try again.",
    };
  }

  await recordAuditEvent(db, {
    firmId: link.firmId,
    actorUserId: null, // the approver has no account
    entityType: "proposal",
    entityId: link.proposalId,
    actionType: "proposal_approved",
    label: `Proposal approved by ${approvedByName}: ${link.view.title} (${link.view.studentName})`,
    // Recent Activity shows proposal events only to staff who may open the
    // proposal (getRecentActivity) — the author id is how it decides.
    metadata: { author_user_id: link.authorUserId },
  });

  // Tell the author: in-app always, plus an email — an approval is the one
  // moment a proposal needs them, and they have no reason to be watching.
  const { error: noticeError } = await db.from("notifications").insert({
    firm_id: link.firmId,
    user_id: link.authorUserId,
    kind: "proposal_approved",
    title: `${approvedByName} approved your proposal (${link.view.studentName})`,
    body: "Next: create the service agreement from the proposal.",
    href: `/proposals/${link.proposalId}`,
  });
  if (noticeError) {
    console.error("Proposal approval notification failed (non-fatal):", noticeError);
  }
  if (link.author?.email) {
    try {
      await sendProposalApprovedStaffEmail({
        email: link.author.email,
        firstName: link.author.firstName,
        approvedByName,
        studentName: link.view.studentName,
        proposalTitle: link.view.title,
        proposalUrl: staffProposalUrl(link.proposalId),
      });
    } catch (e) {
      console.error("Proposal approval email failed (non-fatal):", e);
    }
  }

  revalidatePath(proposalLinkPath(token));
  revalidatePath("/proposals");
  revalidatePath(`/proposals/${link.proposalId}`);
  return { success: true };
}
