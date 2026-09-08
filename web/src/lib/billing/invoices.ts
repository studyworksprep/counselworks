/**
 * Pure invoice helpers (fix plan 12.3 + post-plan adjustments), unit-tested
 * in tests/unit/billing.test.ts. All money is integer cents, USD.
 */
import {
  MIN_PARTIAL_PAYMENT_CENTS,
  type InvoiceDisplayStatus,
} from "../constants/billing";
import { invoiceBalanceCents } from "./aging";

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

/**
 * What the row shows: stored status, refined by the ledger. Open with
 * money applied and past due is still "overdue" (the balance is late);
 * open with money applied and not yet due is "partial".
 */
export function invoiceDisplayStatus(
  invoice: {
    status: string;
    due_on: string;
    amount_cents: number;
    paid_cents?: number;
    credited_cents?: number;
  },
  today: string
): InvoiceDisplayStatus {
  if (invoice.status === "void") return "void";
  if (invoice.status === "paid") return "paid";
  if (isInvoiceOverdue(invoice, today)) return "overdue";
  const settled = (invoice.paid_cents ?? 0) + (invoice.credited_cents ?? 0);
  return settled > 0 ? "partial" : "open";
}

/**
 * A parent's online payment amount: whole cents, at least the floor
 * (unless the remaining balance is smaller — then exactly the balance),
 * never more than the balance. Returns the reason to refuse, or null.
 */
export function partialPaymentProblem(
  amountCents: number,
  invoice: { status: string; amount_cents: number; paid_cents?: number; credited_cents?: number }
): string | null {
  if (invoice.status !== "open") return "This invoice cannot be paid";
  const balance = invoiceBalanceCents(invoice);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return "Enter a payment amount";
  }
  if (amountCents > balance) return "That is more than the remaining balance";
  if (amountCents < MIN_PARTIAL_PAYMENT_CENTS && amountCents !== balance) {
    return `The minimum online payment is $${(MIN_PARTIAL_PAYMENT_CENTS / 100).toFixed(0)}`;
  }
  return null;
}

/**
 * A staff adjustment (manual payment or credit) against an open invoice:
 * whole cents, positive, within the remaining balance.
 */
export function adjustmentProblem(
  amountCents: number,
  invoice: { status: string; amount_cents: number; paid_cents?: number; credited_cents?: number }
): string | null {
  if (invoice.status === "void") return "This invoice is void";
  if (invoice.status === "paid") return "This invoice is already settled";
  if (!Number.isInteger(amountCents) || amountCents <= 0) return "Enter an amount";
  if (amountCents > invoiceBalanceCents(invoice)) {
    return "That is more than the remaining balance";
  }
  return null;
}

/**
 * Void is only for invoices nothing has been paid against: money already
 * received is adjusted with a credit, never erased. Credits alone do not
 * block a void (the credit history stays attached to the voided row).
 */
export function voidProblem(invoice: {
  status: string;
  paid_cents?: number;
  credited_cents?: number;
}): string | null {
  if (invoice.status === "void") return "This invoice is already void";
  if ((invoice.paid_cents ?? 0) > 0) {
    return "A payment has been recorded — credit the balance instead of voiding";
  }
  if (invoice.status === "paid") return "This invoice is already settled";
  return null;
}

/** "$1,234.56" style user input → integer cents, or null when unparsable. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return parseInt(whole, 10) * 100 + parseInt((frac + "00").slice(0, 2), 10);
}
