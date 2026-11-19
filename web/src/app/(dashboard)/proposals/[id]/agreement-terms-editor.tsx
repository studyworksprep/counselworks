"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatCents, parseDollarsToCents } from "@/lib/agreements/schedule";
import { MAX_INSTALLMENTS, INVOICE_EXECUTION_DATE_TERMS } from "@/lib/constants/billing";
import type { AgreementDraftTerms } from "@/lib/agreements/draft";

export function AgreementTermsEditor({ terms, onChange, todayIso }: {
  terms: AgreementDraftTerms; onChange: (terms: AgreementDraftTerms) => void; todayIso: string;
}) {
  const nextKey = useRef(terms.payments.length);
  const patch = (update: Partial<AgreementDraftTerms>) => onChange({ ...terms, ...update });
  function updatePayment(key: string, update: Partial<AgreementDraftTerms["payments"][number]>) {
    patch({ payments: terms.payments.map((payment) => payment.key === key ? { ...payment, ...update } : payment) });
  }
  const total = parseDollarsToCents(terms.totalFee);
  const paymentTotal = terms.payments.reduce((sum, line) => sum + (parseDollarsToCents(line.amount) ?? 0), 0);
  const pastDue = terms.payments.filter((line) => !line.atSigning && line.dueOn && line.dueOn < todayIso);
  return <section aria-label="Agreement terms" className="space-y-5 rounded-xl border border-gray-200 p-4">
    <div><h3 className="font-semibold text-gray-900">Agreement terms</h3><p className="mt-1 text-sm text-gray-600">Review and adjust these details before preparing the final agreement for signature.</p></div>
    <Input id="agreement_total_fee" label="Total engagement fee (USD)" inputMode="decimal" required value={terms.totalFee} onChange={(e) => patch({ totalFee: e.target.value })} />
    <fieldset className="space-y-3"><legend className="mb-2 text-sm font-semibold text-gray-900">Payment schedule</legend>
      {terms.payments.map((payment, index) => <fieldset key={payment.key} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <legend className="px-1 text-sm font-medium text-gray-800">Payment {index + 1}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id={`agreement_label_${payment.key}`} label="Payment label" required maxLength={200} value={payment.label} onChange={(e) => updatePayment(payment.key, { label: e.target.value })} />
          <Input id={`agreement_amount_${payment.key}`} label="Amount (USD)" required inputMode="decimal" value={payment.amount} onChange={(e) => updatePayment(payment.key, { amount: e.target.value })} />
          {!payment.atSigning && <Input id={`agreement_due_${payment.key}`} label="Due date" type="date" required value={payment.dueOn} onChange={(e) => updatePayment(payment.key, { dueOn: e.target.value })} />}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {index === 0 && <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={payment.atSigning} onChange={(e) => updatePayment(payment.key, { atSigning: e.target.checked, dueOn: e.target.checked ? "" : todayIso })} className="h-4 w-4 rounded border-gray-300" />Due when both parties have signed</label>}
          {terms.payments.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => patch({ payments: terms.payments.filter((line) => line.key !== payment.key) })}>Remove payment {index + 1}</Button>}
        </div>
      </fieldset>)}
      <Button type="button" variant="outline" size="sm" disabled={terms.payments.length >= MAX_INSTALLMENTS + 1} onClick={() => patch({ payments: [...terms.payments, { key: `added-${nextKey.current++}`, label: `Payment ${terms.payments.length + 1}`, amount: "", atSigning: false, dueOn: todayIso }] })}>Add payment</Button>
      <p className={`text-sm font-medium ${total !== paymentTotal ? "text-danger-700" : "text-gray-800"}`}>Payment total: {formatCents(paymentTotal)}{total !== null && total !== paymentTotal ? ` — must match ${formatCents(total)}` : ""}</p>
      {pastDue.length > 0 && <Alert variant="warning">{pastDue.length} scheduled payment date{pastDue.length === 1 ? " has" : "s have"} already passed. Update the dates above to spread these payments out. Payments whose dates pass before signing will be due when both parties have signed.</Alert>}
      <p className="text-sm leading-relaxed text-gray-600">{INVOICE_EXECUTION_DATE_TERMS}</p>
    </fieldset>
    <Textarea id="agreement_services" label="Included services" required maxLength={10000} rows={4} value={terms.servicesSummary} onChange={(e) => patch({ servicesSummary: e.target.value })} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Input id="agreement_lessons" type="number" label="Included test preparation lessons" min={0} max={500} required value={terms.testPrepLessons} onChange={(e) => patch({ testPrepLessons: e.target.value, ...(Number(e.target.value) === 0 ? { additionalSessionRate: "" } : {}) })} />
      {Number(terms.testPrepLessons) > 0 && <Input id="agreement_session_rate" label="Each additional session (USD, optional)" inputMode="decimal" value={terms.additionalSessionRate} onChange={(e) => patch({ additionalSessionRate: e.target.value })} />}
    </div>
    <Textarea id="agreement_additional_terms" label="Additional agreement terms (optional)" maxLength={10000} rows={3} value={terms.additionalTerms} onChange={(e) => patch({ additionalTerms: e.target.value })} />
  </section>;
}
