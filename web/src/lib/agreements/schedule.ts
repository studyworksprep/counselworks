import { addMonths, format, parseISO } from "date-fns";
import {
  INSTALLMENT_FREQUENCY_MONTHS,
  INSTALLMENT_FREQUENCY_VALUES,
  MAX_INSTALLMENTS,
  type InstallmentFrequency,
} from "../constants/billing";

/**
 * Pure engagement-billing helpers (fix plan 12.1/12.2), unit-tested in
 * tests/unit/agreements.test.ts. The send-agreement action and the send
 * modal's live preview both build the schedule through this module, and the
 * fee-terms text signed into the body snapshot is rendered from the same
 * lines — the structured plan and the contract text cannot disagree.
 *
 * All money is integer cents, USD.
 */

export interface InstallmentLine {
  installmentNumber: number;
  label: string;
  amountCents: number;
  isRetainer: boolean;
  /** YYYY-MM-DD; null only for the retainer ("due at signing"). */
  dueOn: string | null;
}

export interface FeeTermsInput {
  totalFeeCents: number;
  retainerCents: number;
  installmentCount: number;
  /** YYYY-MM-DD; required when installmentCount > 0. */
  firstDueOn: string | null;
  frequency: InstallmentFrequency | null;
}

export type ScheduleResult =
  | { ok: true; lines: InstallmentLine[] }
  | { ok: false; error: string };

/** "$12,000.00" from integer cents. */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/**
 * Parse a user-entered dollar amount ("3,000", "$1250.50") to integer cents.
 * Returns null for anything that isn't a plain non-negative dollar amount.
 */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [dollars, fraction = ""] = cleaned.split(".");
  return parseInt(dollars, 10) * 100 + parseInt(fraction.padEnd(2, "0") || "0", 10);
}

/**
 * Build the payable lines for an agreement: the retainer (installment 1,
 * due at signing) followed by an even split of the remainder. Cent rounding
 * is distributed one cent at a time to the earliest installments so the
 * lines always sum exactly to the total fee.
 */
export function buildInstallmentSchedule(input: FeeTermsInput): ScheduleResult {
  const { totalFeeCents, retainerCents, installmentCount } = input;

  if (!Number.isInteger(totalFeeCents) || totalFeeCents <= 0) {
    return { ok: false, error: "Enter a total engagement fee" };
  }
  if (!Number.isInteger(retainerCents) || retainerCents < 0) {
    return { ok: false, error: "Retainer must be zero or more" };
  }
  if (retainerCents > totalFeeCents) {
    return { ok: false, error: "Retainer cannot exceed the total fee" };
  }

  const remainderCents = totalFeeCents - retainerCents;
  const lines: InstallmentLine[] = [];

  if (retainerCents > 0) {
    lines.push({
      installmentNumber: 1,
      label: "Retainer (due at signing)",
      amountCents: retainerCents,
      isRetainer: true,
      dueOn: null,
    });
  }

  if (remainderCents === 0) {
    if (installmentCount !== 0) {
      return {
        ok: false,
        error: "The retainer covers the full fee — set installments to 0",
      };
    }
    return { ok: true, lines };
  }

  if (!Number.isInteger(installmentCount) || installmentCount < 1) {
    return {
      ok: false,
      error: "Choose how many installments cover the remaining balance",
    };
  }
  if (installmentCount > MAX_INSTALLMENTS) {
    return { ok: false, error: `At most ${MAX_INSTALLMENTS} installments` };
  }
  if (!input.firstDueOn || !/^\d{4}-\d{2}-\d{2}$/.test(input.firstDueOn)) {
    return { ok: false, error: "Choose the first installment due date" };
  }
  if (!input.frequency || !INSTALLMENT_FREQUENCY_VALUES.has(input.frequency)) {
    return { ok: false, error: "Choose a payment frequency" };
  }

  const stepMonths = INSTALLMENT_FREQUENCY_MONTHS[input.frequency];
  const firstDue = parseISO(input.firstDueOn);
  const baseCents = Math.floor(remainderCents / installmentCount);
  const extraCents = remainderCents % installmentCount;

  for (let i = 0; i < installmentCount; i++) {
    lines.push({
      installmentNumber: lines.length + 1,
      label: `Installment ${i + 1} of ${installmentCount}`,
      amountCents: baseCents + (i < extraCents ? 1 : 0),
      isRetainer: false,
      dueOn: format(addMonths(firstDue, stepMonths * i), "yyyy-MM-dd"),
    });
  }

  return { ok: true, lines };
}

/**
 * The canonical fee-terms section appended to the agreement body before
 * hashing — this exact text is what both parties sign over.
 */
export function renderFeeTermsSection(
  totalFeeCents: number,
  lines: InstallmentLine[]
): string {
  const rows = lines
    .map((l) => {
      const due = l.dueOn
        ? ` — due ${format(parseISO(l.dueOn), "MMMM d, yyyy")}`
        : "";
      return `${l.installmentNumber}. ${l.label}: ${formatCents(l.amountCents)}${due}`;
    })
    .join("\n");

  return [
    "",
    "----------------------------------------",
    "ENGAGEMENT FEE & PAYMENT SCHEDULE",
    "",
    `Total engagement fee: ${formatCents(totalFeeCents)}`,
    "",
    rows,
    "",
  ].join("\n");
}
