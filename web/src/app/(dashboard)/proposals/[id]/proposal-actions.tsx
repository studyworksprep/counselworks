"use client";
import { ArrowLink } from "@/components/ui/arrow-link";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useWriteRefresh } from "@/lib/hooks/use-write-refresh";
import {
  PROPOSAL_DISPLAY_BADGES,
  PROPOSAL_DISPLAY_LABELS,
  type ProposalDisplayStatus,
} from "@/lib/constants/proposals";
import {
  deleteProposal,
  duplicateProposal,
  markProposalApproved,
  sendProposal,
  withdrawProposal,
} from "@/lib/actions/proposals";
import { paymentOptionLabel } from "@/lib/proposals/payment-options";
import type { PaymentStructure } from "@/lib/constants/proposals";
import { ProposalAgreementDialog, type FamilyOption, type ConversionOptions } from "./proposal-agreement-dialog";
export type { ConversionOptions } from "./proposal-agreement-dialog";

const AGREEMENT_STATUS_LABEL: Record<string, string> = {
  sent: "awaiting signatures",
  partially_signed: "partially signed",
  completed: "fully executed",
  voided: "voided",
};

/**
 * Status and actions for one proposal: email it, copy its link, record an
 * off-line approval, withdraw, duplicate, delete a draft — and, once
 * approved, create the service agreement that carries its terms.
 * Every button maps to one server action that re-checks access and state.
 */
export function ProposalActions({
  proposalId,
  status,
  displayStatus,
  parentEmail,
  publicUrl,
  facts,
  rejectionComment,
  agreement,
  family,
  conversion,
  paymentStructures,
}: {
  paymentStructures: PaymentStructure[];
  proposalId: string;
  /** Stored status: draft | sent | approved | rejected | withdrawn. */
  status: string;
  displayStatus: ProposalDisplayStatus;
  parentEmail: string;
  /** The client's link while the proposal is out with them. */
  publicUrl: string | null;
  /** Pre-formatted on the server (firm-local dates). */
  facts: { label: string; value: string }[];
  rejectionComment: string | null;
  agreement: { status: string; familyId: string } | null;
  family: FamilyOption | null;
  /** Present exactly when a service agreement can be created now. */
  conversion: ConversionOptions | null;
}) {
  const router = useRouter();
  const commitWrite = useWriteRefresh();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [approvedPaymentStructure, setApprovedPaymentStructure] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Conversion modal state.
  const [showConvert, setShowConvert] = useState(false);
  const [createdFamily, setCreatedFamily] = useState<FamilyOption | null>(null);
  const linkedFamily = createdFamily ?? family;

  function run(
    action: () => Promise<{ error?: string } | { success: true; warning?: string }>,
    done: string
  ) {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("warning" in result && result.warning) setWarning(result.warning);
      else toast(done);
      commitWrite();
    });
  }

  async function handleSend(resend: boolean) {
    const ok = await confirmDialog({
      title: resend
        ? `Email the proposal to ${parentEmail} again?`
        : `Email this proposal to ${parentEmail}?`,
      body: resend
        ? "They'll get the same private link as before."
        : "They'll get a private link to review and approve it — no account needed.",
      confirmLabel: resend ? "Send again" : "Send proposal",
    });
    if (!ok) return;
    run(() => sendProposal(proposalId), resend ? "Proposal re-sent" : "Proposal sent");
  }

  async function handleMarkApproved() {
    if (paymentStructures.length > 1 && !approvedPaymentStructure) { setError("Choose the payment option the client approved"); return; }
    const ok = await confirmDialog({
      title: "Record the client's approval?",
      body: "Use this when the client approved by phone, email, or in person. The proposal is then frozen and ready to become a service agreement.",
      confirmLabel: "Mark approved",
    });
    if (!ok) return;
    run(() => markProposalApproved(proposalId, approvedPaymentStructure), "Approval recorded");
  }

  async function handleWithdraw() {
    const ok = await confirmDialog({
      title: "Withdraw this proposal?",
      body: "The client's link stops working immediately. The proposal stays here as a record, and you can duplicate it to send a new version.",
      destructive: true,
      confirmLabel: "Withdraw",
    });
    if (!ok) return;
    run(() => withdrawProposal(proposalId), "Proposal withdrawn");
  }

  async function handleDelete() {
    const ok = await confirmDialog({
      title: "Delete this draft?",
      body: "It was never sent. This can't be undone.",
      destructive: true,
      confirmLabel: "Delete draft",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteProposal(proposalId);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      toast("Draft deleted");
      router.push("/proposals");
    });
  }

  function handleDuplicate() {
    setError(null);
    startTransition(async () => {
      const result = await duplicateProposal(proposalId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast("Copied to a new draft");
      router.push(`/proposals/${result.id}/edit`);
    });
  }

  async function handleCopyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast("Proposal link copied");
    } catch {
      toast("Couldn't copy — select the link and copy it manually", "error");
    }
  }

  const activeAgreement = agreement && agreement.status !== "voided" ? agreement : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">Status</h2>
          <Badge variant={PROPOSAL_DISPLAY_BADGES[displayStatus] ?? "default"}>
            {PROPOSAL_DISPLAY_LABELS[displayStatus] ?? displayStatus}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {warning && <Alert variant="warning">{warning}</Alert>}
        {rejectionComment && (
          <section className="rounded-xl border border-warning-200 bg-warning-50 p-4" aria-label="Client feedback">
            <h3 className="text-sm font-semibold text-warning-900">Client feedback</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">{rejectionComment}</p>
            <p className="mt-3 text-xs leading-relaxed text-gray-600">Duplicate this proposal to prepare a revised draft. The original response stays here for reference.</p>
          </section>
        )}

        <dl className="space-y-2 text-sm">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {fact.label}
              </dt>
              <dd className="text-gray-800 [overflow-wrap:anywhere]">{fact.value}</dd>
            </div>
          ))}
          {linkedFamily && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Family
              </dt>
              <dd>
                <Link
                  href={`/families/${linkedFamily.id}`}
                  className="text-primary-700 underline"
                >
                  {linkedFamily.household_name}
                </Link>
              </dd>
            </div>
          )}
          {agreement && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Service agreement
              </dt>
              <dd className="text-gray-800">
                <span className="capitalize">
                  {AGREEMENT_STATUS_LABEL[agreement.status] ?? agreement.status}
                </span>{" "}
                ·{" "}
                <ArrowLink icon="billing" href={`/families/${agreement.familyId}/billing`}>
                  Open billing
                </ArrowLink>
              </dd>
            </div>
          )}
        </dl>

        {publicUrl && (
          <div>
            <label
              htmlFor="proposal_link"
              className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500"
            >
              Client link
            </label>
            <div className="flex items-center gap-2">
              <input
                id="proposal_link"
                readOnly
                value={publicUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-600"
              />
              <Button size="sm" variant="outline" icon="copy" type="button" onClick={handleCopyLink}>
                Copy link
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
          {status === "draft" && (
            <Button icon="email" onClick={() => handleSend(false)} disabled={isPending}>
              Email to client
            </Button>
          )}
          {conversion && (
            <Button icon="add" onClick={() => setShowConvert(true)} disabled={isPending}>
              Create service agreement
            </Button>
          )}
          {status === "sent" && (
            <>
              <Button icon="email"
                variant="outline"
                onClick={() => handleSend(true)}
                disabled={isPending}
              >
                Resend email
              </Button>
              {paymentStructures.length > 1 && <Select
                id="staff_payment_structure" label="Payment option approved by client"
                value={approvedPaymentStructure} onChange={(e) => setApprovedPaymentStructure(e.target.value)}
                options={[{ value: "", label: "Choose the client's preference" }, ...paymentStructures.map((structure) => ({ value: structure, label: paymentOptionLabel(structure) }))]}
              />}
              <Button icon="approve" variant="outline" onClick={handleMarkApproved} disabled={isPending}>
                Mark as approved
              </Button>
            </>
          )}
          {(status === "draft" || status === "sent") && (
            <Button icon="edit"
              variant="outline"
              onClick={() => router.push(`/proposals/${proposalId}/edit`)}
              disabled={isPending}
            >
              Edit
            </Button>
          )}
          <Button icon="copy" variant="outline" onClick={handleDuplicate} disabled={isPending}>
            Duplicate as new draft
          </Button>
          {(status === "sent" || status === "approved" || status === "rejected") && !activeAgreement && (
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={isPending}
              className="self-start text-sm text-gray-600 underline hover:text-danger-600"
            >
              Withdraw proposal
            </button>
          )}
          {status === "draft" && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="self-start text-sm text-gray-600 underline hover:text-danger-600"
            >
              Delete draft
            </button>
          )}
        </div>
      </CardContent>

      {conversion && showConvert && <ProposalAgreementDialog
        proposalId={proposalId} conversion={conversion} family={linkedFamily}
        onClose={() => setShowConvert(false)}
        onFamilyCreated={(created) => { setCreatedFamily(created); commitWrite(); }}
        onSent={(result) => {
          if (result.warning) setWarning(result.warning);
          else toast("Service agreement sent for signature");
          commitWrite(() => setShowConvert(false));
        }}
      />}
    </Card>
  );
}
