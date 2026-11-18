import type { InstallmentLine } from "../agreements/schedule";
import { PAYMENT_STRUCTURES, PAYMENT_STRUCTURE_VALUES, type PaymentStructure } from "../constants/proposals";
import { isIsoDate, parseStoredSchedule, scheduleTotalCents, toStoredSchedule } from "./schedule";

export interface ProposalPaymentOption {
  structure: PaymentStructure;
  depositCents: number | null;
  installmentCount: number | null;
  firstDueOn: string | null;
  lines: InstallmentLine[];
}

export function paymentOptionLabel(structure: PaymentStructure): string {
  return PAYMENT_STRUCTURES.find((option) => option.value === structure)!.label;
}

/** Legacy columns hold the default schedule until approval, then the chosen one. */
export function paymentOptionColumns(option: ProposalPaymentOption) {
  return {
    payment_structure: option.structure,
    deposit_cents: option.depositCents,
    installment_count: option.installmentCount,
    first_due_on: option.firstDueOn,
    payment_schedule_json: toStoredSchedule(option.lines),
  };
}

export function toStoredPaymentOptions(options: ProposalPaymentOption[]) {
  return options.map((option) => ({
    structure: option.structure,
    deposit_cents: option.depositCents,
    installment_count: option.installmentCount,
    first_due_on: option.firstDueOn,
    payment_schedule_json: toStoredSchedule(option.lines),
  }));
}

interface PaymentOptionRow {
  payment_options_json?: unknown;
  payment_structure: string;
  payment_schedule_json: unknown;
  deposit_cents: number | null;
  installment_count: number | null;
  first_due_on: string | null;
  discounted_cost_cents: number;
}

/** NULL means a pre-options proposal. Malformed new data never falls back silently. */
export function paymentOptionsFromRow(row: PaymentOptionRow): ProposalPaymentOption[] | null {
  const raw = row.payment_options_json == null
    ? [{ structure: row.payment_structure, deposit_cents: row.deposit_cents ?? null,
        installment_count: row.installment_count ?? null, first_due_on: row.first_due_on ?? null,
        payment_schedule_json: row.payment_schedule_json }]
    : row.payment_options_json;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > PAYMENT_STRUCTURES.length) return null;
  const options: ProposalPaymentOption[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") return null;
    const option = value as Record<string, unknown>;
    if (!PAYMENT_STRUCTURE_VALUES.includes(option.structure as PaymentStructure)) return null;
    const structure = option.structure as PaymentStructure;
    const lines = parseStoredSchedule(option.payment_schedule_json);
    if (!lines || (row.payment_options_json != null && scheduleTotalCents(lines) !== row.discounted_cost_cents) || options.some((o) => o.structure === structure)) return null;
    const deposit = option.deposit_cents;
    const count = option.installment_count;
    const date = option.first_due_on;
    if (deposit != null && (typeof deposit !== "number" || !Number.isInteger(deposit) || deposit <= 0)) return null;
    if (count != null && (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 36)) return null;
    if (date != null && (typeof date !== "string" || !isIsoDate(date))) return null;
    if (structure === "half_half" && (date == null || deposit != null || count != null)) return null;
    if ((structure === "deposit_monthly" || structure === "deposit_quarterly") && (deposit == null || count == null || date == null || Number(deposit) >= row.discounted_cost_cents)) return null;
    if (structure === "custom" && (deposit != null || count != null || date != null)) return null;
    options.push({ structure, lines, depositCents: (deposit as number | null) ?? null,
      installmentCount: (count as number | null) ?? null, firstDueOn: (date as string | null) ?? null });
  }
  return options;
}

/** Never infer a preference when the client was offered a choice. */
export function choosePaymentOption(options: ProposalPaymentOption[], choice: unknown) {
  if (options.length === 1 && (choice == null || choice === "")) return options[0];
  return options.find((option) => option.structure === choice) ?? null;
}
