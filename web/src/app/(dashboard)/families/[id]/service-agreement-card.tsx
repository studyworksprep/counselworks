"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useWriteRefresh } from "@/lib/hooks/use-write-refresh";
import { formatDate } from "@/lib/utils";
import {
  sendAgreement,
  signAgreement,
  voidAgreement,
  generateMissingInvoices,
} from "@/lib/actions/agreements";
import {
  buildInstallmentSchedule,
  formatCents,
  parseDollarsToCents,
} from "@/lib/agreements/schedule";
import {
  INSTALLMENT_FREQUENCIES,
  type InstallmentFrequency,
} from "@/lib/constants/billing";
import type { AgreementSummary } from "@/lib/db/queries";

const STATUS_BADGE: Record<
  string,
  "default" | "primary" | "warning" | "success" | "danger"
> = {
  sent: "warning",
  partially_signed: "primary",
  completed: "success",
  voided: "default",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Awaiting signatures",
  partially_signed: "Partially signed",
  completed: "Fully executed",
  voided: "Voided",
};

/** Staff-facing one-line fee summary, e.g. "$12,000.00 · $3,000.00 retainer · 2 installments". */
function feeSummary(a: AgreementSummary): string | null {
  if (a.total_fee_cents === null) return null;
  const parts = [formatCents(a.total_fee_cents)];
  if (a.retainer_cents) parts.push(`${formatCents(a.retainer_cents)} retainer`);
  const installments = a.installments.filter((i) => !i.is_retainer).length;
  if (installments > 0) {
    parts.push(`${installments} installment${installments === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

/**
 * Staff-side service agreement panel (fix plan 10.1 + 12.2): send from a
 * template with engagement fee terms, countersign for the firm, void, and
 * track execution state and the payment schedule.
 */
export function ServiceAgreementCard({
  familyId,
  agreements,
  templates,
  canSend,
  invoiceGenerationNeeded = [],
}: {
  familyId: string;
  agreements: AgreementSummary[];
  templates: { id: string; name: string }[];
  canSend: boolean;
  /**
   * Agreement ids whose inline invoice generation at completion partially
   * failed (fewer invoices/PDFs than installments) — shows the staff
   * remediation button for exactly those rows (12.3).
   */
  invoiceGenerationNeeded?: string[];
}) {
  const commitWrite = useWriteRefresh();
  const confirmDialog = useConfirm();
  const [showSend, setShowSend] = useState(false);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Fee-terms fields are controlled so the modal can preview the exact
  // schedule the server will store (both sides use buildInstallmentSchedule).
  const [totalFee, setTotalFee] = useState("");
  const [retainer, setRetainer] = useState("");
  const [installmentCount, setInstallmentCount] = useState("2");
  const [firstDueOn, setFirstDueOn] = useState("");
  const [frequency, setFrequency] = useState<InstallmentFrequency>("monthly");

  const preview = useMemo(() => {
    if (!totalFee.trim()) {
      // Mirrors the server's no-silent-discard rule: a retainer without a
      // total is a half-entered fee.
      return retainer.trim()
        ? { error: "Enter the total engagement fee, or clear the retainer" }
        : null;
    }
    const totalFeeCents = parseDollarsToCents(totalFee.trim());
    if (totalFeeCents === null) {
      return { error: "Enter a valid total fee amount" };
    }
    const retainerCents = retainer.trim()
      ? parseDollarsToCents(retainer.trim())
      : 0;
    if (retainerCents === null) {
      return { error: "Enter a valid retainer amount" };
    }
    const result = buildInstallmentSchedule({
      totalFeeCents,
      retainerCents,
      installmentCount: installmentCount.trim()
        ? parseInt(installmentCount, 10)
        : 0,
      firstDueOn: firstDueOn || null,
      frequency,
    });
    return result.ok ? { lines: result.lines } : { error: result.error };
  }, [totalFee, retainer, installmentCount, firstDueOn, frequency]);

  function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await sendAgreement(familyId, formData);
      if ("error" in result && result.error) setError(result.error);
      else commitWrite(() => setShowSend(false));
    });
  }

  function handleFirmSign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!signingId) return;
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signAgreement(signingId, formData);
      if ("error" in result && result.error) setError(result.error);
      else commitWrite(() => setSigningId(null));
    });
  }

  function handleGenerateInvoices(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await generateMissingInvoices(id);
      if ("error" in result && result.error) setError(result.error);
      else commitWrite();
    });
  }

  async function handleVoid(id: string) {
    if (
      !(await confirmDialog({
        title: "Void this agreement?",
        body: "The family will no longer be able to sign it.",
        destructive: true,
        confirmLabel: "Void",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      const result = await voidAgreement(id);
      if ("error" in result && result.error) setError(result.error);
      else commitWrite();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Service Agreement</h3>
          {canSend && templates.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowSend(true)}>
              Send agreement
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && <Alert className="mb-3">{error}</Alert>}
        {agreements.length === 0 ? (
          <p className="text-sm text-gray-500">
            No agreement sent yet.
            {templates.length === 0 &&
              " Create an agreement template in Settings first."}
          </p>
        ) : (
          <ul className="space-y-3">
            {agreements.map((a) => (
              <li
                key={a.id}
                className="border-b border-gray-50 pb-2 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {a.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      Sent {formatDate(a.sent_at)}
                      {a.completed_at &&
                        ` · executed ${formatDate(a.completed_at)}`}
                    </p>
                    {feeSummary(a) && (
                      <p className="text-xs text-gray-600">{feeSummary(a)}</p>
                    )}
                  </div>
                  <Badge variant={STATUS_BADGE[a.status] ?? "default"}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </Badge>
                  {a.status !== "completed" &&
                    a.status !== "voided" &&
                    !a.signed_roles.includes("firm") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSigningId(a.id)}
                      >
                        Sign for firm
                      </Button>
                    )}
                  {a.status !== "completed" && a.status !== "voided" && (
                    <button
                      type="button"
                      onClick={() => handleVoid(a.id)}
                      disabled={isPending}
                      className="text-xs text-gray-500 hover:text-danger-600"
                    >
                      Void
                    </button>
                  )}
                  {invoiceGenerationNeeded.includes(a.id) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handleGenerateInvoices(a.id)}
                    >
                      Generate invoices
                    </Button>
                  )}
                </div>
                {a.installments.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                      Payment schedule
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-1">
                      {a.installments.map((i) => (
                        <li
                          key={i.installment_number}
                          className="flex justify-between text-xs text-gray-600"
                        >
                          <span>
                            {i.label}
                            {i.due_on && ` — due ${formatDate(i.due_on)}`}
                          </span>
                          <span className="font-medium">
                            {formatCents(i.amount_cents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal
        open={showSend}
        onClose={() => !isPending && setShowSend(false)}
        title="Send service agreement"
        description="The family's primary contact is notified by email and signs in the family portal."
      >
        <form onSubmit={handleSend} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Select
            name="template_id"
            label="Agreement template"
            required
            placeholder="Choose a template"
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
          />

          <fieldset className="space-y-3 rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-sm font-medium text-gray-700">
              Fee terms
            </legend>
            <p className="text-xs text-gray-500">
              The fee and payment schedule are written into the agreement text
              the family signs. Leave the total blank to send without fee
              terms.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                name="total_fee"
                label="Total engagement fee (USD)"
                placeholder="e.g. 12,000"
                value={totalFee}
                onChange={(e) => setTotalFee(e.target.value)}
              />
              <Input
                name="retainer"
                label="Retainer due at signing (USD)"
                placeholder="0"
                value={retainer}
                onChange={(e) => setRetainer(e.target.value)}
              />
            </div>
            {totalFee.trim() !== "" && (
              <div className="grid grid-cols-3 gap-3">
                <Input
                  name="installment_count"
                  label="Installments"
                  type="number"
                  min={0}
                  max={36}
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(e.target.value)}
                />
                <Input
                  name="first_due_on"
                  label="First due"
                  type="date"
                  value={firstDueOn}
                  onChange={(e) => setFirstDueOn(e.target.value)}
                />
                <Select
                  name="frequency"
                  label="Frequency"
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(e.target.value as InstallmentFrequency)
                  }
                  options={INSTALLMENT_FREQUENCIES.map((f) => ({
                    value: f.value,
                    label: f.label,
                  }))}
                />
              </div>
            )}
            {preview &&
              ("error" in preview ? (
                <p className="text-xs text-warning-700">{preview.error}</p>
              ) : (
                <ul className="space-y-0.5 rounded-md bg-gray-50 p-2">
                  {preview.lines.map((l) => (
                    <li
                      key={l.installmentNumber}
                      className="flex justify-between text-xs text-gray-700"
                    >
                      <span>
                        {l.label}
                        {l.dueOn && ` — due ${formatDate(l.dueOn)}`}
                      </span>
                      <span className="font-medium">
                        {formatCents(l.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ))}
          </fieldset>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              loading={isPending}
              disabled={!!(preview && "error" in preview)}
            >
              Send for signature
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowSend(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!signingId}
        onClose={() => !isPending && setSigningId(null)}
        title="Sign for the firm"
        description="Typing your full legal name is your electronic signature."
      >
        <form onSubmit={handleFirmSign} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Input
            name="signed_name"
            label="Full legal name"
            required
            placeholder="e.g. Jordan Ellis"
          />
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="consent"
              required
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            I consent to signing this agreement electronically on behalf of
            the firm, and intend this to be my legal signature.
          </label>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending}>
              Sign agreement
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSigningId(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
