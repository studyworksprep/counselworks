import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { formatCents } from "@/lib/agreements/schedule";
import { isInvoiceOverdue } from "@/lib/billing/invoices";
import {
  INVOICE_STATUS_BADGES,
  INVOICE_STATUS_LABELS,
} from "@/lib/constants/billing";
import type { InvoiceSummary } from "@/lib/db/queries";
import { InvoiceDownloadButton } from "./invoice-download-button";
import { PayInvoiceButton } from "./pay-invoice-button";

type BadgeVariant = "default" | "primary" | "warning" | "success" | "danger";

/**
 * Invoice list (fix plan 12.3/12.5), shared by the staff family page and
 * the family portal. Render only when invoices exist — a family without
 * fee terms has no billing surface, not an empty one. "Overdue" is derived
 * from due_on at render time, never stored. `canPay` is set only on the
 * parent portal: open invoices get the Checkout Pay action (12.5).
 */
export function InvoicesCard({
  invoices,
  canPay = false,
}: {
  invoices: InvoiceSummary[];
  canPay?: boolean;
}) {
  if (invoices.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">Invoices</h3>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {invoices.map((inv) => {
            const overdue = isInvoiceOverdue(inv, today);
            return (
              <li
                key={inv.id}
                className="flex flex-wrap items-center gap-2 border-b border-gray-50 pb-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {inv.invoice_number} · {inv.label}
                  </p>
                  <p className="text-xs text-gray-500">
                    Due {formatDate(inv.due_on)} · issued{" "}
                    {formatDate(inv.issued_at)}
                  </p>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {formatCents(inv.amount_cents)}
                </span>
                <Badge
                  variant={
                    overdue
                      ? "danger"
                      : ((INVOICE_STATUS_BADGES[inv.status] ??
                          "default") as BadgeVariant)
                  }
                >
                  {overdue
                    ? "Overdue"
                    : (INVOICE_STATUS_LABELS[inv.status] ?? inv.status)}
                </Badge>
                {inv.document_id && (
                  <InvoiceDownloadButton documentId={inv.document_id} />
                )}
                {canPay && inv.status === "open" && (
                  <PayInvoiceButton invoiceId={inv.id} />
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
