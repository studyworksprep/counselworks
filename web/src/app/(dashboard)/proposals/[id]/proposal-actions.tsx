"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
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
import { sendAgreementFromProposal } from "@/lib/actions/agreements";

interface FamilyOption {
  id: string;
  household_name: string;
}

export interface ConversionOptions {
  templates: { id: string; name: string }[];
  /** Households the caller may send an agreement to. */
  families: FamilyOption[];
  /** Owners/admins may add the prospect as a new household (fix plan 7.1). */
  canCreateFamily: boolean;
  defaultHouseholdName: string;
  /** e.g. "$10,800.00 in 2 payments". */
  priceSummary: string;
  /** Scheduled payments whose date has already passed. */
  pastDueNotes: string[];
}

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
  const [convertError, setConvertError] = useState<string | null>(null);
  const [createdFamily, setCreatedFamily] = useState<FamilyOption | null>(null);
  const linkedFamily = createdFamily ?? family;
  const [familyMode, setFamilyMode] = useState<"new" | "existing">(
    conversion?.canCreateFamily && !family ? "new" : "existing"
  );
  const [familyId, setFamilyId] = useState(family?.id ?? "");
  const [householdName, setHouseholdName] = useState(
    conversion?.defaultHouseholdName ?? ""
  );

  const familyOptions: FamilyOption[] = [];
  for (const option of [
    ...(linkedFamily ? [linkedFamily] : []),
    ...(conversion?.families ?? []),
  ]) {
    if (!familyOptions.some((f) => f.id === option.id)) familyOptions.push(option);
  }

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

  function handleConvert(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setConvertError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await sendAgreementFromProposal(proposalId, formData);
      if ("error" in result) {
        setConvertError(result.error);
        if (result.familyId) {
          // The household exists now: continue with it rather than offer
          // to create a second one.
          setCreatedFamily({ id: result.familyId, household_name: householdName });
          setFamilyMode("existing");
          setFamilyId(result.familyId);
          commitWrite();
        }
        return;
      }
      if (result.warning) setWarning(result.warning);
      else toast("Service agreement sent for signature");
      commitWrite(() => setShowConvert(false));
    });
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
                <Link
                  href={`/families/${agreement.familyId}/billing`}
                  className="text-primary-700 underline"
                >
                  Open billing
                </Link>
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
              <button
                type="button"
                onClick={handleCopyLink}
                className="shrink-0 text-xs text-primary-700 hover:text-primary-800"
              >
                Copy link
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
          {status === "draft" && (
            <Button onClick={() => handleSend(false)} disabled={isPending}>
              Email to client
            </Button>
          )}
          {conversion && (
            <Button onClick={() => setShowConvert(true)} disabled={isPending}>
              Create service agreement
            </Button>
          )}
          {status === "sent" && (
            <>
              <Button
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
              <Button variant="outline" onClick={handleMarkApproved} disabled={isPending}>
                Mark as approved
              </Button>
            </>
          )}
          {(status === "draft" || status === "sent") && (
            <Button
              variant="outline"
              onClick={() => router.push(`/proposals/${proposalId}/edit`)}
              disabled={isPending}
            >
              Edit
            </Button>
          )}
          <Button variant="outline" onClick={handleDuplicate} disabled={isPending}>
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

      {conversion && (
        <Modal
          open={showConvert}
          onClose={() => !isPending && setShowConvert(false)}
          title="Create service agreement"
          description="The proposal's price, payment schedule, and accepted terms are written into the agreement the family signs."
          size="lg"
        >
          <form onSubmit={handleConvert} className="space-y-5">
            {convertError && <Alert>{convertError}</Alert>}

            <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
              Engagement fee:{" "}
              <span className="font-medium">{conversion.priceSummary}</span>,
              exactly as approved. The family&apos;s primary contact gets a
              secure signing link by email.
            </p>
            {conversion.pastDueNotes.length > 0 && (
              <Alert variant="warning">
                {conversion.pastDueNotes.length === 1
                  ? "One payment date has already passed"
                  : "Some payment dates have already passed"}{" "}
                ({conversion.pastDueNotes.join("; ")}). Its invoice will be
                overdue as soon as the agreement is executed.
              </Alert>
            )}

            {conversion.templates.length === 0 ? (
              <Alert variant="warning">
                Your firm has no agreement template yet.{" "}
                <Link href="/settings#firm-settings" className="underline">
                  Create one in Settings
                </Link>{" "}
                (owners and admins), then come back.
              </Alert>
            ) : (
              <Select
                id="convert_template_id"
                name="template_id"
                label="Agreement template"
                required
                placeholder="Choose a template"
                options={conversion.templates.map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
              />
            )}

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-gray-700">Family</legend>
              {conversion.canCreateFamily && !linkedFamily && (
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="family_mode"
                    value="new"
                    checked={familyMode === "new"}
                    onChange={() => setFamilyMode("new")}
                    className="mt-0.5 h-4 w-4 border-gray-300"
                  />
                  <span>
                    <span className="font-medium text-gray-900">
                      Add as a new household
                    </span>
                    <span className="block text-xs text-gray-600">
                      Creates the family, the parent as primary contact, and
                      the student from the proposal.
                    </span>
                  </span>
                </label>
              )}
              {familyMode === "new" && conversion.canCreateFamily && !linkedFamily && (
                <div className="pl-6">
                  <Input
                    id="convert_household_name"
                    name="household_name"
                    label="Household name"
                    required
                    maxLength={120}
                    value={householdName}
                    onChange={(e) => setHouseholdName(e.target.value)}
                  />
                </div>
              )}
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="family_mode"
                  value="existing"
                  checked={familyMode === "existing"}
                  onChange={() => setFamilyMode("existing")}
                  className="mt-0.5 h-4 w-4 border-gray-300"
                />
                <span>
                  <span className="font-medium text-gray-900">
                    Use a family already in CounselWorks
                  </span>
                  {!conversion.canCreateFamily && (
                    <span className="block text-xs text-gray-600">
                      New clients are added by an owner or admin. Once this
                      family has been added and assigned to you, choose it
                      here — or ask an owner or admin to create the agreement
                      from this proposal.
                    </span>
                  )}
                </span>
              </label>
              {familyMode === "existing" && (
                <div className="pl-6">
                  {familyOptions.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No families are available to you yet.
                    </p>
                  ) : (
                    <>
                      <Select
                        id="convert_family_id"
                        name="family_id"
                        aria-label="Family"
                        required
                        placeholder="Choose a family"
                        value={familyId}
                        onChange={(e) => setFamilyId(e.target.value)}
                        options={familyOptions.map((f) => ({
                          value: f.id,
                          label: f.household_name,
                        }))}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        The agreement is emailed to that family&apos;s primary
                        contact — make sure it&apos;s the right person.
                      </p>
                    </>
                  )}
                </div>
              )}
            </fieldset>

            <div className="flex gap-3 pt-1">
              <Button
                type="submit"
                loading={isPending}
                disabled={conversion.templates.length === 0}
              >
                Send agreement for signature
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConvert(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
