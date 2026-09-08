"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { useWriteRefresh } from "@/lib/hooks/use-write-refresh";
import {
  creditInvoice,
  recordManualPayment,
  voidInvoice,
} from "@/lib/actions/billing";
import { formatCents } from "@/lib/agreements/schedule";
import { MANUAL_PAYMENT_METHODS } from "@/lib/constants/billing";

type Mode = "payment" | "credit" | "void";

/**
 * Staff adjustments on an open invoice (post-plan billing): record a
 * payment received outside Stripe, credit part of the balance with a
 * reason, or void an invoice nothing has been paid against. Owner/admin
 * only (`manage_billing`); the page decides whether to render this.
 */
export function InvoiceAdjustmentActions({
  invoiceId,
  invoiceNumber,
  balanceCents,
  paidCents,
  todayIso,
}: {
  invoiceId: string;
  invoiceNumber: string;
  balanceCents: number;
  paidCents: number;
  /** Today's date from the server (no Date in render). */
  todayIso: string;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const commitWrite = useWriteRefresh();

  function close() {
    setMode(null);
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>, action: (fd: FormData) => Promise<{ error?: string }>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      commitWrite(close);
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        className="font-medium text-primary-600 hover:underline"
        onClick={() => setMode("payment")}
      >
        Record payment
      </button>
      <button
        type="button"
        className="font-medium text-primary-600 hover:underline"
        onClick={() => setMode("credit")}
      >
        Credit
      </button>
      {paidCents === 0 && (
        <button
          type="button"
          className="text-gray-500 hover:text-danger-600"
          onClick={() => setMode("void")}
        >
          Void
        </button>
      )}

      {mode === "payment" && (
        <Modal
          open
          onClose={close}
          title={`Record a payment on ${invoiceNumber}`}
          description={`Remaining balance ${formatCents(balanceCents)}. For money received outside online payment.`}
        >
          <form
            onSubmit={(e) => submit(e, (fd) => recordManualPayment(invoiceId, fd))}
            className="space-y-4"
          >
            {error && <Alert>{error}</Alert>}
            <Input
              name="amount"
              label="Amount received (USD)"
              inputMode="decimal"
              required
              defaultValue={(balanceCents / 100).toFixed(2)}
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                name="method"
                label="Paid by"
                required
                defaultValue="check"
                options={[...MANUAL_PAYMENT_METHODS]}
              />
              <Input
                name="paid_on"
                label="Date received"
                type="date"
                required
                defaultValue={todayIso}
              />
            </div>
            <Input
              name="reference"
              label="Reference"
              placeholder="Check number, transfer id, memo…"
            />
            <p className="-mt-2 text-xs text-gray-500">
              The household receives a receipt email; the invoice is marked
              paid once its balance reaches zero.
            </p>
            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={isPending}>
                Record payment
              </Button>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {mode === "credit" && (
        <Modal
          open
          onClose={close}
          title={`Credit ${invoiceNumber}`}
          description={`Reduce what is owed (remaining balance ${formatCents(balanceCents)}). Money already received is never changed.`}
        >
          <form
            onSubmit={(e) => submit(e, (fd) => creditInvoice(invoiceId, fd))}
            className="space-y-4"
          >
            {error && <Alert>{error}</Alert>}
            <Input
              name="amount"
              label="Credit amount (USD)"
              inputMode="decimal"
              required
              placeholder="e.g. 500.00"
            />
            <Input
              name="reason"
              label="Reason (the household sees this)"
              required
              placeholder="e.g. Sibling discount"
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={isPending}>
                Apply credit
              </Button>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {mode === "void" && (
        <Modal
          open
          onClose={close}
          title={`Void ${invoiceNumber}`}
          description="The invoice stays on record marked Void, owing nothing. This cannot be undone."
        >
          <form
            onSubmit={(e) => submit(e, (fd) => voidInvoice(invoiceId, fd))}
            className="space-y-4"
          >
            {error && <Alert>{error}</Alert>}
            <Input
              name="reason"
              label="Reason (the household sees this)"
              required
              placeholder="e.g. Issued in error"
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit" variant="danger" loading={isPending}>
                Void invoice
              </Button>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </span>
  );
}
