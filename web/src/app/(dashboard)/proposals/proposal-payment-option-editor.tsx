"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PAYMENT_STRUCTURES } from "@/lib/constants/proposals";
import { MAX_CUSTOM_LINES } from "@/lib/proposals/schedule";
import { effectiveBalanceDueOn, type CustomLineValues, type PaymentOptionFormValues } from "@/lib/proposals/form";

export function ProposalPaymentOptionEditor({ values, graduationYear, todayIso, onChange }: {
  values: PaymentOptionFormValues; graduationYear: string; todayIso: string;
  onChange: (update: Partial<PaymentOptionFormValues>) => void;
}) {
  const structure = values.paymentStructure;
  const option = PAYMENT_STRUCTURES.find((o) => o.value === structure)!;
  const usesDeposit = structure === "deposit_monthly" || structure === "deposit_quarterly";
  const balanceDueOn = effectiveBalanceDueOn({ ...values, graduationYear }, todayIso);
  const nextKey = useRef(values.customLines.length);
  const patch = onChange;
  function patchLine(key: string, update: Partial<CustomLineValues>) {
    patch({ customLines: values.customLines.map((line) => line.key === key ? { ...line, ...update } : line) });
  }
  function addLine() {
    patch({ customLines: [...values.customLines, { key: `line-${nextKey.current++}`, label: "", amount: "", atSigning: false, dueOn: "" }] });
  }
  function removeLine(key: string) { patch({ customLines: values.customLines.filter((line) => line.key !== key) }); }
  return (
    <div className={cn("rounded-xl border", values.enabled ? "border-primary-300 bg-primary-50/30" : "border-gray-200")}>
      <label className="flex cursor-pointer items-start gap-4 p-4">
        <span className="relative mt-0.5 shrink-0">
          <input type="checkbox" role="switch" aria-label={option.label} checked={values.enabled} onChange={(e) => patch({ enabled: e.target.checked })} className="peer absolute inset-0 z-10 h-6 w-11 cursor-pointer opacity-0" />
          <span aria-hidden="true" className="block h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-primary-700 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-600 peer-focus-visible:ring-offset-2" />
          <span aria-hidden="true" className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
        </span>
        <span><span className="block text-sm font-semibold text-gray-900">{option.label}</span><span className="mt-1 block text-xs leading-relaxed text-gray-600">{option.description}</span></span>
      </label>
      {values.enabled && <fieldset aria-label={`${option.label} settings`} className="space-y-4 border-t border-primary-100 p-4">
        {structure === "half_half" && (
          <div className="max-w-xs">
            <Input
              id={`${structure}_balance_due_on`}
              name={`${structure}_balance_due_on`}
              type="date"
              label="Second half due no later than"
              required
              value={balanceDueOn}
              onChange={(e) => patch({ balanceDueOn: e.target.value })}
            />
            <p className="mt-1 text-xs text-gray-500">
              Defaults to January 1 of the student&apos;s senior year. The
              second-half invoice carries this date; it falls due sooner
              if the final application goes in first.
            </p>
          </div>
        )}

        {usesDeposit && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              id={`${structure}_deposit_amount`}
              name={`${structure}_deposit_amount`}
              label="Deposit at signing (USD)"
              required
              inputMode="decimal"
              placeholder="e.g. 2,000"
              value={values.depositAmount}
              onChange={(e) => patch({ depositAmount: e.target.value })}
            />
            <Input
              id={`${structure}_installment_count`}
              name={`${structure}_installment_count`}
              type="number"
              min={1}
              max={36}
              label={
                structure === "deposit_monthly"
                  ? "Monthly payments"
                  : "Quarterly payments"
              }
              required
              value={values.installmentCount}
              onChange={(e) => patch({ installmentCount: e.target.value })}
            />
            <Input
              id={`${structure}_first_payment_on`}
              name={`${structure}_first_payment_on`}
              type="date"
              label="First payment due"
              required
              value={values.firstPaymentOn}
              onChange={(e) => patch({ firstPaymentOn: e.target.value })}
            />
          </div>
        )}

        {structure === "custom" && (
          <div className="space-y-3">
            {values.customLines.map((line, index) => (
              <div
                key={line.key}
                className="rounded-lg border border-gray-200 p-3"
                data-testid="custom-line"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem_11rem]">
                  <Input
                    id={`custom_label_${index}`}
                    label={`Payment ${index + 1}`}
                    maxLength={120}
                    placeholder="What this payment is"
                    value={line.label}
                    onChange={(e) => patchLine(line.key, { label: e.target.value })}
                  />
                  <Input
                    id={`custom_amount_${index}`}
                    label="Amount (USD)"
                    inputMode="decimal"
                    value={line.amount}
                    onChange={(e) => patchLine(line.key, { amount: e.target.value })}
                  />
                  {index === 0 && line.atSigning ? (
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-gray-700">Due</p>
                      <p className="py-2 text-sm text-gray-600">At signing</p>
                    </div>
                  ) : (
                    <Input
                      id={`custom_due_${index}`}
                      type="date"
                      label="Due date"
                      value={line.dueOn}
                      onChange={(e) => patchLine(line.key, { dueOn: e.target.value })}
                    />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  {index === 0 ? (
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={line.atSigning}
                        onChange={(e) =>
                          patchLine(line.key, { atSigning: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Due when the agreement is signed
                    </label>
                  ) : (
                    <span />
                  )}
                  {values.customLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="text-xs text-gray-500 hover:text-danger-600"
                    >
                      Remove payment {index + 1}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              disabled={values.customLines.length >= MAX_CUSTOM_LINES}
            >
              Add payment
            </Button>
          </div>
        )}
      </fieldset>}
    </div>
  );
}
