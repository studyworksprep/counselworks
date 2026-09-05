"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { payInvoice } from "@/lib/actions/billing";

export type PayInvoiceAction = (
  invoiceId: string
) => Promise<{ url?: string; error?: string }>;

/**
 * Pay action (fix plan 12.5): hands the payer to Stripe Checkout on the
 * firm's connected account. The invoice shows Paid only after the verified
 * webhook lands — the button never flips state locally. `pay` defaults to
 * the portal action; the secure signing link passes its token-bound action
 * instead (12.7).
 */
export function PayInvoiceButton({
  invoiceId,
  pay = payInvoice,
}: {
  invoiceId: string;
  pay?: PayInvoiceAction;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePay() {
    setError(null);
    startTransition(async () => {
      const result = await pay(invoiceId);
      if ("error" in result && result.error) setError(result.error);
      else if ("url" in result && result.url) window.location.assign(result.url);
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-danger-600">{error}</span>}
      <Button size="sm" loading={isPending} onClick={handlePay}>
        Pay
      </Button>
    </span>
  );
}
