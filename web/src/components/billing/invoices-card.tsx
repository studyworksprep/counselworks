import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { formatCents } from "@/lib/agreements/schedule";
import { invoiceDisplayStatus } from "@/lib/billing/invoices";
import { summarizeReceivables } from "@/lib/billing/aging";
import {
  INVOICE_DISPLAY_BADGES,
  INVOICE_DISPLAY_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/constants/billing";
import type { InvoiceSummary } from "@/lib/db/queries";
import { InvoiceDownloadButton } from "./invoice-download-button";
import { PayInvoiceButton, type PayInvoiceAction } from "./pay-invoice-button";
import { InvoiceAdjustmentActions } from "./invoice-adjustment-actions";

type BadgeVariant = "default" | "primary" | "warning" | "success" | "danger";

/**
 * Invoice list (fix plan 12.3/12.5 + post-plan adjustments), shared by the
 * staff family page, the family portal, and the secure signing link.
 * Render only when invoices exist — a family without fee terms has no
 * billing surface, not an empty one. Each row is a small ledger: face
 * value, what has been paid or credited, the remaining balance, and a
 * history of every payment and credit. The status badge is derived
 * (`invoiceDisplayStatus`): "Partially paid" and "Overdue" are never
 * stored. `canPay` is set only on the parent-facing surfaces; `canAdjust`
 * only on the staff Billing page for owners/admins (`manage_billing`).
 * The header carries the household's balance from the same aging helper
 * the staff AR report uses, so both parties read one number.
 */
export function InvoicesCard({
  invoices,
  canPay = false,
  pay,
  showDownloads = true,
  canAdjust = false,
}: {
  invoices: InvoiceSummary[];
  canPay?: boolean;
  /** Token-bound pay action for the secure signing link (12.7). */
  pay?: PayInvoiceAction;
  /**
   * PDF downloads need a signed-in document reader; the account-less
   * signing link hides them (the receipt email is the household's record).
   */
  showDownloads?: boolean;
  /** Staff owner/admin: record payments, credit, void. */
  canAdjust?: boolean;
}) {
  if (invoices.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const balance = summarizeReceivables(invoices, today);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold text-gray-900">Invoices</h3>
          <p className="text-sm text-gray-600">
            Balance due{" "}
            <span className="font-semibold text-gray-900" data-testid="invoices-balance">
              {formatCents(balance.open_cents)}
            </span>
            {balance.overdue_cents > 0 && (
              <span className="ml-2 text-danger-600">
                {formatCents(balance.overdue_cents)} overdue
              </span>
            )}
            {balance.credited_cents > 0 && (
              <span className="ml-2 text-gray-500">
                {formatCents(balance.credited_cents)} credited
              </span>
            )}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {invoices.map((inv) => {
            const display = invoiceDisplayStatus(inv, today);
            const isVoid = display === "void";
            const settledSomething = inv.paid_cents > 0 || inv.credited_cents > 0;
            const historyCount = inv.payments.length + inv.credits.length;
            return (
              <li
                key={inv.id}
                data-testid="invoice-row"
                data-invoice-number={inv.invoice_number}
                className="border-b border-gray-50 pb-2 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 basis-full sm:basis-64 sm:flex-1">
                    <p className="text-sm font-medium break-words text-gray-900">
                      {inv.invoice_number} · {inv.label}
                    </p>
                    <p className="text-xs text-gray-500">
                      Due {formatDate(inv.due_on)} · issued{" "}
                      {formatDate(inv.issued_at)}
                      {inv.status === "paid" && inv.paid_at && ` · paid ${formatDate(inv.paid_at)}`}
                      {isVoid && inv.voided_at && ` · voided ${formatDate(inv.voided_at)}`}
                    </p>
                    {isVoid && inv.void_reason && (
                      <p className="text-xs text-gray-500">Void: {inv.void_reason}</p>
                    )}
                    {!isVoid && settledSomething && (
                      <p className="text-xs text-gray-600" data-testid="invoice-ledger">
                        {inv.paid_cents > 0 && `${formatCents(inv.paid_cents)} paid`}
                        {inv.paid_cents > 0 && inv.credited_cents > 0 && " · "}
                        {inv.credited_cents > 0 && `${formatCents(inv.credited_cents)} credited`}
                        {inv.status === "open" && (
                          <>
                            {" · "}
                            <span className="font-medium text-gray-900">
                              {formatCents(inv.balance_cents)} balance
                            </span>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  <span
                    className={
                      isVoid
                        ? "text-sm font-semibold text-gray-400 line-through"
                        : "text-sm font-semibold text-gray-900"
                    }
                  >
                    {formatCents(inv.amount_cents)}
                  </span>
                  <Badge
                    variant={(INVOICE_DISPLAY_BADGES[display] ?? "default") as BadgeVariant}
                  >
                    {INVOICE_DISPLAY_LABELS[display] ?? display}
                  </Badge>
                  {showDownloads && inv.document_id && (
                    <InvoiceDownloadButton documentId={inv.document_id} />
                  )}
                  {canPay && inv.status === "open" && (
                    <PayInvoiceButton
                      invoiceId={inv.id}
                      balanceCents={inv.balance_cents}
                      amountCents={inv.amount_cents}
                      pay={pay}
                    />
                  )}
                  {canAdjust && inv.status === "open" && (
                    <InvoiceAdjustmentActions
                      invoiceId={inv.id}
                      invoiceNumber={inv.invoice_number}
                      balanceCents={inv.balance_cents}
                      paidCents={inv.paid_cents}
                      todayIso={today}
                    />
                  )}
                </div>
                {historyCount > 0 && (
                  <details className="mt-1 text-xs text-gray-600">
                    <summary className="cursor-pointer text-gray-500">
                      History ({historyCount})
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-3">
                      {inv.payments.map((p) => (
                        <li key={p.id}>
                          {formatDate(p.paid_at)} · {formatCents(p.amount_cents)} paid ·{" "}
                          {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                          {p.reference && ` · ${p.reference}`}
                          {p.paid_by_name && ` · by ${p.paid_by_name}`}
                          {p.recorded_by_name && ` · recorded by ${p.recorded_by_name}`}
                        </li>
                      ))}
                      {inv.credits.map((c) => (
                        <li key={c.id}>
                          {formatDate(c.created_at)} · {formatCents(c.amount_cents)} credited ·{" "}
                          {c.reason}
                          {c.created_by_name && ` · by ${c.created_by_name}`}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
