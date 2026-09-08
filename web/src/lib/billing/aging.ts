/**
 * Pure receivables helpers (fix plan 12.6), unit-tested in
 * tests/unit/billing.test.ts. All money is integer cents, USD; dates are
 * ISO `YYYY-MM-DD` strings compared in UTC so a due date never shifts with
 * the server's timezone.
 */
import {
  AGING_BUCKETS,
  INVOICE_REMINDER_DAYS,
  INVOICE_REMINDER_REPEAT_EVERY_DAYS,
  type AgingBucket,
} from "../constants/billing";

/** Whole days from `dueOn` to `today` (negative = not yet due). */
export function daysPastDue(dueOn: string, today: string): number {
  const due = Date.UTC(
    Number(dueOn.slice(0, 4)),
    Number(dueOn.slice(5, 7)) - 1,
    Number(dueOn.slice(8, 10))
  );
  const now = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10))
  );
  return Math.round((now - due) / 86_400_000);
}

export function agingBucketFor(dueOn: string, today: string): AgingBucket {
  const days = daysPastDue(dueOn, today);
  for (const b of AGING_BUCKETS) {
    if (days >= b.minDays && days <= b.maxDays) return b.value;
  }
  return "over_90";
}

export type AgingTotals = Record<AgingBucket, number>;

export function emptyAgingTotals(): AgingTotals {
  return Object.fromEntries(
    AGING_BUCKETS.map((b) => [b.value, 0])
  ) as AgingTotals;
}

export interface ReceivableInvoice {
  status: string;
  amount_cents: number;
  due_on: string;
  paid_at?: string | null;
  /** Settled totals (migration 00042); absent = nothing settled yet. */
  paid_cents?: number;
  credited_cents?: number;
}

/** What is still owed on an invoice: amount less payments and credits. */
export function invoiceBalanceCents(inv: {
  status: string;
  amount_cents: number;
  paid_cents?: number;
  credited_cents?: number;
}): number {
  if (inv.status === "void") return 0;
  return Math.max(
    0,
    inv.amount_cents - (inv.paid_cents ?? 0) - (inv.credited_cents ?? 0)
  );
}

export interface ReceivablesSummary {
  /** Sum of open invoices (due or not). */
  open_cents: number;
  /** Sum of open invoices past due. */
  overdue_cents: number;
  open_count: number;
  overdue_count: number;
  /** Days past due of the oldest unpaid invoice, 0 when nothing is overdue. */
  oldest_overdue_days: number;
  /** Money actually received (card + manual), across open and paid invoices. */
  paid_cents: number;
  /** Written down by credits — never money received. */
  credited_cents: number;
  /** Most recent paid_at, or null. */
  last_paid_at: string | null;
  aging: AgingTotals;
}

/**
 * Roll a family's (or a firm's) invoices up into balance + aging totals.
 * Void invoices are excluded from every figure; "overdue" is derived from
 * due_on exactly as isInvoiceOverdue does — never stored. Open invoices
 * count by their remaining BALANCE (partial payments and credits reduce
 * what is owed); paid_cents is money received on any non-void invoice,
 * whether or not it is fully settled. A row without settled totals (the
 * v1 shape) is treated as: paid ⇒ paid in full, open ⇒ nothing paid.
 */
export function summarizeReceivables(
  invoices: readonly ReceivableInvoice[],
  today: string
): ReceivablesSummary {
  const summary: ReceivablesSummary = {
    open_cents: 0,
    overdue_cents: 0,
    open_count: 0,
    overdue_count: 0,
    oldest_overdue_days: 0,
    paid_cents: 0,
    credited_cents: 0,
    last_paid_at: null,
    aging: emptyAgingTotals(),
  };
  for (const inv of invoices) {
    if (inv.status === "void") continue;
    const paid =
      inv.paid_cents ?? (inv.status === "paid" ? inv.amount_cents : 0);
    summary.paid_cents += paid;
    summary.credited_cents += inv.credited_cents ?? 0;
    if (inv.status === "paid") {
      if (inv.paid_at && (!summary.last_paid_at || inv.paid_at > summary.last_paid_at)) {
        summary.last_paid_at = inv.paid_at;
      }
      continue;
    }
    if (inv.status !== "open") continue;
    const balance = invoiceBalanceCents(inv);
    if (balance === 0) continue;
    summary.open_cents += balance;
    summary.open_count += 1;
    summary.aging[agingBucketFor(inv.due_on, today)] += balance;
    const days = daysPastDue(inv.due_on, today);
    if (days > 0) {
      summary.overdue_cents += balance;
      summary.overdue_count += 1;
      summary.oldest_overdue_days = Math.max(summary.oldest_overdue_days, days);
    }
  }
  return summary;
}

/**
 * Whether an invoice `daysOverdue` days past due gets a reminder today.
 * Stateless cadence (like document-request reminders): the daily cron
 * needs no "last reminded" column to avoid double-sends within a day.
 */
export function isReminderDay(daysOverdue: number): boolean {
  if (daysOverdue <= 0) return false;
  if ((INVOICE_REMINDER_DAYS as readonly number[]).includes(daysOverdue)) {
    return true;
  }
  const last = INVOICE_REMINDER_DAYS[INVOICE_REMINDER_DAYS.length - 1];
  return (
    daysOverdue > last &&
    (daysOverdue - last) % INVOICE_REMINDER_REPEAT_EVERY_DAYS === 0
  );
}
