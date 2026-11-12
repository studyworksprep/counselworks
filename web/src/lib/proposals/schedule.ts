import { format, isValid, parseISO } from "date-fns";
import { MAX_INSTALLMENTS, type InstallmentFrequency } from "../constants/billing";
import {
  PAYMENT_STRUCTURES,
  type PaymentStructure,
} from "../constants/proposals";
import {
  buildInstallmentSchedule,
  formatCents,
  type InstallmentLine,
  type ScheduleResult,
} from "../agreements/schedule";

/**
 * Pure payment-schedule builder for client proposals, unit-tested in
 * tests/unit/proposals.test.ts.
 *
 * Every payment structure resolves to the SAME line shape the service
 * agreement stores (`InstallmentLine` → agreement_installments), so an
 * approved proposal's schedule is carried into its agreement line for line:
 * what the client approved, what both parties sign, and what gets invoiced
 * cannot disagree. The form's live preview and the save action both build
 * through this module.
 */

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-31). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, "yyyy-MM-dd") === value;
}

/** One hand-written payment of a custom schedule. */
export interface CustomLineInput {
  label: string;
  amountCents: number;
  /** YYYY-MM-DD; null = due at signing (allowed on the first line only). */
  dueOn: string | null;
}

export interface ProposalScheduleInput {
  structure: PaymentStructure;
  /** What the client actually owes: the discounted cost. */
  totalCents: number;
  /** Deposit structures: the amount due at signing. */
  depositCents: number | null;
  /** Deposit structures: how many payments follow the deposit. */
  installmentCount: number | null;
  /**
   * The first dated payment. Half/half: the date the second half is due by.
   * Deposit structures: the first installment date.
   */
  firstDueOn: string | null;
  /** Custom structure only. */
  customLines: CustomLineInput[];
}

const FREQUENCY_BY_STRUCTURE: Record<string, InstallmentFrequency | null> =
  Object.fromEntries(PAYMENT_STRUCTURES.map((s) => [s.value, s.frequency]));

const PAYMENT_NOUN: Record<InstallmentFrequency, string> = {
  monthly: "Monthly payment",
  quarterly: "Quarterly payment",
};

/** Hand-written schedules get one more line than the installment cap: the at-signing payment. */
export const MAX_CUSTOM_LINES = MAX_INSTALLMENTS + 1;

/**
 * Default "second half due by" date for the half/half structure: January 1
 * of the student's graduation year (mid senior year, when regular-decision
 * applications are in), or the next January 1 when that has already passed.
 */
export function defaultBalanceDueOn(
  graduationYear: number,
  todayIso: string
): string {
  const seniorYearJan1 = `${graduationYear}-01-01`;
  if (seniorYearJan1 > todayIso) return seniorYearJan1;
  return `${Number(todayIso.slice(0, 4)) + 1}-01-01`;
}

export function buildProposalSchedule(
  input: ProposalScheduleInput
): ScheduleResult {
  const { structure, totalCents } = input;
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    return { ok: false, error: "Enter the cost before choosing a payment schedule" };
  }

  if (structure === "half_half") {
    if (totalCents < 2) {
      return { ok: false, error: "The cost is too small to split in two" };
    }
    if (!isIsoDate(input.firstDueOn)) {
      return { ok: false, error: "Choose the date the second half is due by" };
    }
    // An odd cent goes to the first half so the two always sum exactly.
    const firstHalf = Math.ceil(totalCents / 2);
    const dueLabel = format(parseISO(input.firstDueOn), "MMMM d, yyyy");
    return {
      ok: true,
      lines: [
        {
          installmentNumber: 1,
          label: "First half (due at signing)",
          amountCents: firstHalf,
          isRetainer: true,
          dueOn: null,
        },
        {
          installmentNumber: 2,
          label: `Second half (when the final application is submitted or ${dueLabel}, whichever comes first)`,
          amountCents: totalCents - firstHalf,
          isRetainer: false,
          dueOn: input.firstDueOn,
        },
      ],
    };
  }

  if (structure === "deposit_monthly" || structure === "deposit_quarterly") {
    const frequency = FREQUENCY_BY_STRUCTURE[structure] as InstallmentFrequency;
    const depositCents = input.depositCents;
    if (depositCents === null || !Number.isInteger(depositCents) || depositCents <= 0) {
      return { ok: false, error: "Enter the deposit amount" };
    }
    if (depositCents >= totalCents) {
      return {
        ok: false,
        error: "The deposit must be less than the cost — the rest is paid in installments",
      };
    }
    const count = input.installmentCount;
    if (count === null || !Number.isInteger(count) || count < 1) {
      return { ok: false, error: "Choose how many payments follow the deposit" };
    }
    if (!isIsoDate(input.firstDueOn)) {
      return { ok: false, error: "Choose the first payment date" };
    }
    // Reuse the agreement builder for the even split, cent rounding, and
    // date stepping; only the wording differs for a proposal.
    const built = buildInstallmentSchedule({
      totalFeeCents: totalCents,
      retainerCents: depositCents,
      installmentCount: count,
      firstDueOn: input.firstDueOn,
      frequency,
    });
    if (!built.ok) return built;
    return {
      ok: true,
      lines: built.lines.map((line) => ({
        ...line,
        label: line.isRetainer
          ? "Deposit (due at signing)"
          : `${PAYMENT_NOUN[frequency]} ${line.installmentNumber - 1} of ${count}`,
      })),
    };
  }

  // Custom: the counselor's own lines, validated into the same shape.
  const rows = input.customLines;
  if (rows.length === 0) {
    return { ok: false, error: "Add at least one payment" };
  }
  if (rows.length > MAX_CUSTOM_LINES) {
    return { ok: false, error: `At most ${MAX_CUSTOM_LINES} payments` };
  }
  const lines: InstallmentLine[] = [];
  let previousDueOn: string | null = null;
  for (const [index, row] of rows.entries()) {
    const n = index + 1;
    const label = row.label.trim();
    if (!label) {
      return { ok: false, error: `Payment ${n} needs a description` };
    }
    if (!Number.isInteger(row.amountCents) || row.amountCents <= 0) {
      return { ok: false, error: `Payment ${n} needs an amount` };
    }
    if (row.dueOn === null) {
      if (index > 0) {
        return {
          ok: false,
          error: `Payment ${n} needs a due date — only the first payment can be due at signing`,
        };
      }
    } else {
      if (!isIsoDate(row.dueOn)) {
        return { ok: false, error: `Payment ${n} needs a valid due date` };
      }
      if (previousDueOn !== null && row.dueOn < previousDueOn) {
        return {
          ok: false,
          error: `Payment ${n} is dated before payment ${n - 1} — list payments in date order`,
        };
      }
      previousDueOn = row.dueOn;
    }
    const atSigning = row.dueOn === null;
    lines.push({
      installmentNumber: n,
      // A null due date prints no date in the signed text, so the label
      // itself has to say when an at-signing payment is due.
      label:
        atSigning && !/signing/i.test(label) ? `${label} (due at signing)` : label,
      amountCents: row.amountCents,
      isRetainer: atSigning,
      dueOn: row.dueOn,
    });
  }
  const sum = scheduleTotalCents(lines);
  if (sum !== totalCents) {
    const gap = formatCents(Math.abs(totalCents - sum));
    return {
      ok: false,
      error: `The payments add up to ${formatCents(sum)} — ${gap} ${
        sum < totalCents ? "less" : "more"
      } than the ${formatCents(totalCents)} cost`,
    };
  }
  return { ok: true, lines };
}

export function scheduleTotalCents(lines: InstallmentLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountCents, 0);
}

/** The amount due at signing (0 when every payment is dated). */
export function atSigningCents(lines: InstallmentLine[]): number {
  return lines
    .filter((line) => line.isRetainer)
    .reduce((sum, line) => sum + line.amountCents, 0);
}

/** Dated payments whose date has already passed as of `todayIso`. */
export function pastDueLines(
  lines: InstallmentLine[],
  todayIso: string
): InstallmentLine[] {
  return lines.filter((line) => line.dueOn !== null && line.dueOn < todayIso);
}

// ---------------------------------------------------------------------------
// Storage shape (proposals.payment_schedule_json)
// ---------------------------------------------------------------------------

/**
 * One resolved payment as stored on the proposal — deliberately the same
 * column names as agreement_installments, so the two render through the
 * same components and convert without a mapping table.
 */
export interface StoredScheduleLine {
  installment_number: number;
  label: string;
  amount_cents: number;
  is_retainer: boolean;
  due_on: string | null;
}

export function toStoredSchedule(lines: InstallmentLine[]): StoredScheduleLine[] {
  return lines.map((line) => ({
    installment_number: line.installmentNumber,
    label: line.label,
    amount_cents: line.amountCents,
    is_retainer: line.isRetainer,
    due_on: line.dueOn,
  }));
}

/**
 * Read a stored schedule back. Returns null when the JSON isn't a
 * well-formed schedule — callers treat that as "this proposal has no usable
 * schedule" and fail loudly rather than guessing.
 */
export function parseStoredSchedule(value: unknown): InstallmentLine[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const lines: InstallmentLine[] = [];
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const dueOn = row.due_on ?? null;
    if (
      typeof row.label !== "string" ||
      !row.label ||
      typeof row.amount_cents !== "number" ||
      !Number.isInteger(row.amount_cents) ||
      row.amount_cents <= 0 ||
      typeof row.is_retainer !== "boolean" ||
      (dueOn !== null && !isIsoDate(dueOn)) ||
      (dueOn === null && !row.is_retainer)
    ) {
      return null;
    }
    lines.push({
      installmentNumber: index + 1,
      label: row.label,
      amountCents: row.amount_cents,
      isRetainer: row.is_retainer,
      dueOn: dueOn as string | null,
    });
  }
  return lines;
}
