"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { payInvoice } from "@/lib/actions/billing";
import { formatCents } from "@/lib/agreements/schedule";
import { parseDollarsToCents, partialPaymentProblem } from "@/lib/billing/invoices";
import { MIN_PARTIAL_PAYMENT_CENTS } from "@/lib/constants/billing";

export type PayInvoiceAction = (
  invoiceId: string,
  amountCents?: number
) => Promise<{ url?: string; error?: string }>;

/**
 * Pay action (fix plan 12.5): hands the payer to Stripe Checkout on the
 * firm's connected account. "Pay" charges the remaining balance in one
 * step; "Pay part" (post-plan billing adjustments) asks for an amount
 * first. The invoice shows Paid only after the verified webhook lands —
 * the button never flips state locally. `pay` defaults to the portal
 * action; the secure signing link passes its token-bound action (12.7).
 */
export function PayInvoiceButton({
  invoiceId,
  balanceCents,
  amountCents,
  pay = payInvoice,
}: {
  invoiceId: string;
  /** What is still owed; the one-step Pay charges exactly this. */
  balanceCents: number;
  /** The invoice's face value, for the validation floor. */
  amountCents: number;
  pay?: PayInvoiceAction;
}) {
  const [error, setError] = useState<string | null>(null);
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [isPending, startTransition] = useTransition();

  function go(cents?: number) {
    setError(null);
    startTransition(async () => {
      const result = await pay(invoiceId, cents);
      if ("error" in result && result.error) setError(result.error);
      else if ("url" in result && result.url) window.location.assign(result.url);
    });
  }

  function handlePartial(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cents = parseDollarsToCents(partialAmount);
    if (cents === null) {
      setError("Enter an amount like 500.00");
      return;
    }
    const problem = partialPaymentProblem(cents, {
      status: "open",
      amount_cents: amountCents,
      paid_cents: amountCents - balanceCents,
    });
    if (problem) {
      setError(problem);
      return;
    }
    go(cents);
  }

  // A balance at or below the floor can only be paid in full.
  const canSplit = balanceCents > MIN_PARTIAL_PAYMENT_CENTS;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {error && !partialOpen && (
        <span className="text-xs text-danger-600">{error}</span>
      )}
      <Button size="sm" loading={isPending} onClick={() => go()}>
        Pay
      </Button>
      {canSplit && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setPartialOpen(true);
          }}
          className="text-xs font-medium text-primary-600 hover:underline"
        >
          Pay part
        </button>
      )}
      {partialOpen && (
        <Modal
          open
          onClose={() => setPartialOpen(false)}
          title="Pay part of this invoice"
          description={`Remaining balance ${formatCents(balanceCents)}. Minimum online payment ${formatCents(MIN_PARTIAL_PAYMENT_CENTS)}.`}
        >
          <form onSubmit={handlePartial} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <Input
              name="amount"
              label="Amount to pay now (USD)"
              inputMode="decimal"
              placeholder="e.g. 500.00"
              value={partialAmount}
              onChange={(e) => setPartialAmount(e.target.value)}
              required
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={isPending}>
                Continue to payment
              </Button>
              <Button type="button" variant="outline" onClick={() => setPartialOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </span>
  );
}
