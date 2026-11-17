"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Modal } from "@/components/modals/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AgreementBody } from "@/components/agreements/agreement-body";
import {
  previewAgreementFromProposal,
  sendAgreementFromProposal,
  type ProposalAgreementPreview,
} from "@/lib/actions/agreements";

export interface FamilyOption { id: string; household_name: string }
export interface ConversionOptions {
  templates: { id: string; name: string }[];
  families: FamilyOption[];
  canCreateFamily: boolean;
  defaultHouseholdName: string;
  priceSummary: string;
  paymentOptionLabel: string;
  pastDueNotes: string[];
}

/** Proposal-specific setup → read-only document review → explicit send. */
export function ProposalAgreementDialog({ proposalId, conversion, family, onClose, onSent, onFamilyCreated }: {
  proposalId: string;
  conversion: ConversionOptions;
  family: FamilyOption | null;
  onClose: () => void;
  onSent: (result: { warning?: string }) => void;
  onFamilyCreated: (family: FamilyOption) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<ProposalAgreementPreview | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { stepHeading.current?.focus(); }, [preview]);
  const [useFirmTemplate, setUseFirmTemplate] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [familyMode, setFamilyMode] = useState<"new" | "existing">(conversion.canCreateFamily && !family ? "new" : "existing");
  const [familyId, setFamilyId] = useState(family?.id ?? "");
  const [householdName, setHouseholdName] = useState(conversion.defaultHouseholdName);
  const linkedFamily = family;
  const familyOptions = [...(family ? [family] : []), ...conversion.families.filter((f) => f.id !== family?.id)];

  function setupData() {
    const data = new FormData();
    data.set("template_id", useFirmTemplate ? templateId : "");
    data.set("family_mode", familyMode);
    data.set("family_id", familyId);
    data.set("household_name", householdName);
    return data;
  }
  function handlePreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await previewAgreementFromProposal(proposalId, setupData());
        if ("error" in result) setError(result.error);
        else setPreview(result);
      } catch { setError("The agreement preview could not be loaded. Please try again."); }
    });
  }
  function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) return;
    const form = new FormData(event.currentTarget);
    const data = setupData();
    data.set("review_token", preview.reviewToken);
    data.set("reviewed", String(form.get("reviewed") ?? ""));
    setError(null);
    startTransition(async () => {
      try {
        const result = await sendAgreementFromProposal(proposalId, data);
        if ("error" in result) {
          setError(result.error);
          setPreview(null);
          if (result.familyId) {
            setFamilyMode("existing"); setFamilyId(result.familyId);
            onFamilyCreated({ id: result.familyId, household_name: preview.householdName });
          }
        } else onSent(result);
      } catch { setError("The send could not be confirmed. Check the proposal's status before trying again."); }
    });
  }

  // The wide review must sit above the dashboard sidebar, outside its stacking context.
  // The parent mounts this dialog only after a client-side button click.
  if (typeof document === "undefined") return null;
  return createPortal(
    <Modal open onClose={() => { if (!isPending) onClose(); }} trapFocus size={preview ? "xl" : "lg"}
      title={preview ? "Review service agreement" : "Prepare service agreement"}
      description={preview ? "Review the complete agreement and signing recipient before sending." : "Build the agreement from the proposal the client approved."}>
      {error && <Alert className="mb-4">{error}</Alert>}
      {preview ? (
        <form onSubmit={handleSend} className="space-y-5">
          <div className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-900">
            <h3 ref={stepHeading} tabIndex={-1} className="font-semibold focus:outline-none">{preview.title}</h3>
            <p className="mt-2">For {preview.householdName}</p>
            <p>Signing link will be emailed to <strong className="break-all">{preview.recipientEmail}</strong>.</p>
            <p className="mt-2 text-xs">Nothing has been sent. {familyMode === "new" ? "This household will be added when you send." : "The existing household will receive this agreement."}</p>
          </div>
          <article aria-label="Agreement preview" className="rounded-xl border border-gray-200 bg-white p-5 sm:p-8">
            <AgreementBody source={preview.body} />
          </article>
          <section aria-label="Signature requests" className="grid gap-3 rounded-xl bg-gray-50 p-4 text-sm sm:grid-cols-2">
            <div><h3 className="font-semibold text-gray-900">Client signature</h3><p className="break-all text-gray-600">{preview.recipientEmail}</p><p className="mt-1 text-xs text-gray-500">Requested after sending</p></div>
            <div><h3 className="font-semibold text-gray-900">Firm signature</h3><p className="text-gray-600">An authorized member of your firm</p><p className="mt-1 text-xs text-gray-500">Completed in the agreement signing flow</p></div>
          </section>
          <label className="flex items-start gap-3 text-sm leading-relaxed text-gray-800">
            <input type="checkbox" name="reviewed" required disabled={isPending} className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300" />
            I have reviewed the complete agreement and the signing recipient.
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={isPending}>Send agreement for signature</Button>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => { setPreview(null); setError(null); }}>Back to setup</Button>
            <Button type="button" variant="ghost" disabled={isPending} onClick={onClose}>Cancel</Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handlePreview} className="space-y-5">
          <fieldset disabled={isPending} className="space-y-5">
            <div className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-900">
              <h3 ref={stepHeading} tabIndex={-1} className="font-semibold focus:outline-none">Included from the approved proposal</h3>
              <p className="mt-2 leading-relaxed">Services, program details, included test preparation, the agreed fee and the client&apos;s selected payment schedule transfer into the agreement automatically.</p>
              <dl className="mt-3 space-y-1">
                <div><dt className="inline font-medium">Engagement fee: </dt><dd className="inline">{conversion.priceSummary}</dd></div>
                <div><dt className="inline font-medium">Payment option: </dt><dd className="inline">{conversion.paymentOptionLabel}</dd></div>
              </dl>
            </div>
            {conversion.pastDueNotes.length > 0 && <Alert variant="warning">Some payment dates have already passed ({conversion.pastDueNotes.join("; ")}). Those invoices will be overdue when the agreement is executed.</Alert>}
            <section className="rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900">{useFirmTemplate ? "Firm template + approved proposal" : "Proposal-based agreement"}</h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{useFirmTemplate ? "Your selected firm template adds wording alongside the accepted proposal and its payment schedule." : "The default agreement introduces the parties and carries over the accepted proposal. No separate template is needed."}</p>
              {useFirmTemplate && templateId && <p className="mt-2 text-sm font-medium text-gray-800">Additional wording: {conversion.templates.find((t) => t.id === templateId)?.name}</p>}
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-primary-700">Optional: add a firm template</summary>
                <div className="mt-3 space-y-3">
                  {conversion.templates.length ? <>
                    <label className="flex items-start gap-2 text-sm text-gray-800"><input type="checkbox" checked={useFirmTemplate} onChange={(e) => setUseFirmTemplate(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300" />Use a firm template for additional agreement wording</label>
                    {useFirmTemplate && <Select id="convert_template_id" name="template_id" label="Additional agreement template" required placeholder="Choose a firm template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} options={conversion.templates.map((t) => ({ value: t.id, label: t.name }))} />}
                    <p className="text-xs leading-relaxed text-gray-600">The approved proposal and its payment schedule are included with either choice. Review any additional wording before sending.</p>
                  </> : <p className="text-sm text-gray-600">No firm templates are available. You can continue with the proposal-based agreement or <Link href="/settings#firm-settings" className="text-primary-700 underline">create a template in Settings</Link>.</p>}
                </div>
              </details>
            </section>
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
            <div className="flex flex-wrap gap-3 pt-1">
              <Button type="submit" loading={isPending}>Preview agreement</Button>
              <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>Cancel</Button>
            </div>
          </fieldset>
        </form>
      )}
    </Modal>, document.body
  );
}
