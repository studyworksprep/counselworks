/**
 * Pure invoice helpers (fix plan 12.3), unit-tested in
 * tests/unit/billing.test.ts. All money is integer cents, USD.
 */

/** "INV-0001"-style per-firm accounting numbers, zero-padded to 4+. */
const INVOICE_NUMBER_PATTERN = /^INV-(\d+)$/;

/**
 * The next `count` sequential invoice numbers after the highest existing
 * one. Non-conforming existing numbers are ignored rather than fatal — the
 * UNIQUE (firm_id, invoice_number) constraint is the real guard.
 */
export function nextInvoiceNumbers(
  existing: readonly string[],
  count: number
): string[] {
  let max = 0;
  for (const number of existing) {
    const match = INVOICE_NUMBER_PATTERN.exec(number);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return Array.from({ length: count }, (_, i) =>
    `INV-${String(max + 1 + i).padStart(4, "0")}`
  );
}

/**
 * When an invoice is due: the retainer is due on the execution date (its
 * installment carries no date — "due at signing"); everything else inherits
 * its installment's due date.
 */
export function invoiceDueOn(
  installment: { is_retainer: boolean; due_on: string | null },
  executedOn: string
): string {
  return installment.is_retainer || !installment.due_on
    ? executedOn
    : installment.due_on;
}

/** Overdue is derived, never stored: unpaid and past due as of `today`. */
export function isInvoiceOverdue(
  invoice: { status: string; due_on: string },
  today: string
): boolean {
  return invoice.status === "open" && invoice.due_on < today;
}
