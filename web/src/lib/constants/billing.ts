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
