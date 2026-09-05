/**
 * Single source of truth for engagement-billing enums (fix plan 12.1;
 * CLAUDE.md rule 4). Imported by the send-agreement action, the schedule
 * builder, and every label map — never respell these values.
 */

export const INSTALLMENT_FREQUENCIES = [
  { value: "monthly", label: "Monthly", months: 1 },
  { value: "quarterly", label: "Quarterly", months: 3 },
] as const;

export type InstallmentFrequency =
  (typeof INSTALLMENT_FREQUENCIES)[number]["value"];

export const INSTALLMENT_FREQUENCY_VALUES = new Set<string>(
  INSTALLMENT_FREQUENCIES.map((f) => f.value)
);

export const INSTALLMENT_FREQUENCY_LABELS: Record<string, string> =
  Object.fromEntries(INSTALLMENT_FREQUENCIES.map((f) => [f.value, f.label]));

export const INSTALLMENT_FREQUENCY_MONTHS: Record<string, number> =
  Object.fromEntries(INSTALLMENT_FREQUENCIES.map((f) => [f.value, f.months]));

/** Sanity cap on schedule length; a longer plan is almost certainly a typo. */
export const MAX_INSTALLMENTS = 36;

// Invoice status (12.3). Matches the CHECK constraint in migration 00036.
// 12.3 writes only 'open'; 'paid' arrives with 12.4 payment collection and
// 'void' with credit/adjustment flows. "Overdue" is derived from due_on in
// the app layer, never stored.
export const INVOICE_STATUSES = [
  { value: "open", label: "Open", badge: "warning" },
  { value: "paid", label: "Paid", badge: "success" },
  { value: "void", label: "Void", badge: "default" },
] as const;

export const INVOICE_STATUS_LABELS: Record<string, string> =
  Object.fromEntries(INVOICE_STATUSES.map((s) => [s.value, s.label]));

export const INVOICE_STATUS_BADGES: Record<string, string> =
  Object.fromEntries(INVOICE_STATUSES.map((s) => [s.value, s.badge]));

// Receivables aging (12.6). Buckets are by days past due as of "today";
// "current" is open-not-yet-due. Defined once here and consumed by the
// aging helper, the Reports AR table, and its CSV export.
export const AGING_BUCKETS = [
  { value: "current", label: "Current", minDays: -Infinity, maxDays: 0 },
  { value: "1_30", label: "1–30", minDays: 1, maxDays: 30 },
  { value: "31_60", label: "31–60", minDays: 31, maxDays: 60 },
  { value: "61_90", label: "61–90", minDays: 61, maxDays: 90 },
  { value: "over_90", label: "90+", minDays: 91, maxDays: Infinity },
] as const;

export type AgingBucket = (typeof AGING_BUCKETS)[number]["value"];

/**
 * Overdue-invoice reminder cadence (12.6): days past due on which the
 * household is nudged. Day 1 (the morning after the due date), then weekly
 * for the first month, then every 30 days — never daily, never silent.
 */
export const INVOICE_REMINDER_DAYS = [1, 7, 14, 21, 30] as const;
export const INVOICE_REMINDER_REPEAT_EVERY_DAYS = 30;
