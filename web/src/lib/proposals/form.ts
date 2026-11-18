import { parseDollarsToCents } from "../agreements/schedule";
import {
  DEFAULT_VALIDITY_DAYS,
  PAYMENT_STRUCTURE_VALUES,
  PAYMENT_STRUCTURES,
  type PaymentStructure,
} from "../constants/proposals";
import { addDays, formatIsoDate, parseIsoDate } from "../tasks/recurrence";
import type { ProposalInput } from "./input";
import { applyDiscount, parsePercent } from "./pricing";
import type { ProposalRow } from "./row";
import { paymentOptionsFromRow, paymentOptionLabel } from "./payment-options";
import { defaultBalanceDueOn, parseStoredSchedule } from "./schedule";
import {
  DEFAULT_PROPOSAL_TITLE,
  DEFAULT_SERVICES_SUMMARY,
  defaultTermsAndConditions,
} from "./terms";

/**
 * The proposal form's state, as the strings a counselor types, and its two
 * conversions: from a stored row (so the edit form defaults EVERY field —
 * CLAUDE.md DoD rule 6) and to the save action's payload. Pure and
 * unit-tested in tests/unit/proposals.test.ts, including the round trip
 * row → form → payload, which is what proves an untouched edit changes
 * nothing.
 */

export interface CustomLineValues {
  /** Stable React key; never sent to the server. */
  key: string;
  label: string;
  amount: string;
  /** First line only: due when the agreement is signed, no date. */
  atSigning: boolean;
  dueOn: string;
}

export type PaymentOptionFormValues = Pick<ProposalFormValues, "paymentStructure" | "balanceDueOn" | "depositAmount" | "installmentCount" | "firstPaymentOn" | "customLines"> & { enabled: boolean };

export interface ProposalFormValues {
  paymentOptions?: PaymentOptionFormValues[];
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  studentFirstName: string;
  studentLastName: string;
  graduationYear: string;
  title: string;
  introMessage: string;
  servicesSummary: string;
  totalCost: string;
  discountPercent: string;
  discountedCost: string;
  paymentStructure: PaymentStructure;
  /** Half/half. Blank = use the default (January 1 of senior year). */
  balanceDueOn: string;
  /** Deposit structures. */
  depositAmount: string;
  installmentCount: string;
  firstPaymentOn: string;
  /** Custom structure. */
  customLines: CustomLineValues[];
  includeTestPrep: boolean;
  testPrepLessons: string;
  additionalSessionRate: string;
  termsAndConditions: string;
  /**
   * False while the terms are still the untouched starter text, which then
   * follows the form (the test-prep clause appears with the lesson pack).
   * Once edited — and always for a stored proposal — the text is the
   * counselor's and is never rewritten for them.
   */
  termsCustomized: boolean;
  validUntil: string;
}

/** "10800" → "10,800"; "1080050" → "10,800.50". */
export function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function newProposalFormValues(todayIso: string): ProposalFormValues {
  return {
    parentFirstName: "",
    parentLastName: "",
    parentEmail: "",
    studentFirstName: "",
    studentLastName: "",
    graduationYear: "",
    title: DEFAULT_PROPOSAL_TITLE,
    introMessage: "",
    servicesSummary: DEFAULT_SERVICES_SUMMARY,
    totalCost: "",
    discountPercent: "",
    discountedCost: "",
    paymentStructure: "half_half",
    balanceDueOn: "",
    depositAmount: "",
    installmentCount: "",
    firstPaymentOn: "",
    customLines: [
      { key: "line-0", label: "Deposit", amount: "", atSigning: true, dueOn: "" },
      { key: "line-1", label: "", amount: "", atSigning: false, dueOn: "" },
    ],
    includeTestPrep: false,
    testPrepLessons: "",
    additionalSessionRate: "",
    termsAndConditions: "",
    termsCustomized: false,
    validUntil: formatIsoDate(addDays(parseIsoDate(todayIso), DEFAULT_VALIDITY_DAYS)),
  };
}

/** All toggles retain their own settings while disabled. Legacy form callers use one. */
export function paymentOptionFormValues(values: ProposalFormValues): PaymentOptionFormValues[] {
  return values.paymentOptions ?? PAYMENT_STRUCTURES.map(({ value }) => ({
    paymentStructure: value, enabled: value === values.paymentStructure,
    balanceDueOn: value === values.paymentStructure ? values.balanceDueOn : "",
    depositAmount: value === values.paymentStructure ? values.depositAmount : "",
    installmentCount: value === values.paymentStructure ? values.installmentCount : "",
    firstPaymentOn: value === values.paymentStructure ? values.firstPaymentOn : "",
    customLines: value === values.paymentStructure ? values.customLines : newProposalFormValues("2000-01-01").customLines,
  }));
}

function paymentOptionFormValuesFromRow(row: ProposalRow): PaymentOptionFormValues[] {
  const options = paymentOptionsFromRow(row) ?? [];
  return PAYMENT_STRUCTURES.map(({ value }) => {
    const option = options.find((o) => o.structure === value);
    return {
      paymentStructure: value, enabled: !!option,
      balanceDueOn: value === "half_half" ? option?.firstDueOn ?? "" : "",
      depositAmount: option?.depositCents != null ? centsToInput(option.depositCents) : "",
      installmentCount: option?.installmentCount != null ? String(option.installmentCount) : "",
      firstPaymentOn: value.startsWith("deposit_") ? option?.firstDueOn ?? "" : "",
      customLines: value === "custom" && option ? option.lines.map((line, i) => ({
        key: `line-${i}`, label: line.label, amount: centsToInput(line.amountCents),
        atSigning: line.dueOn === null, dueOn: line.dueOn ?? "",
      })) : newProposalFormValues("2000-01-01").customLines,
    };
  });
}

/** Every field of a stored proposal, as the form shows it. */
export function proposalFormValuesFromRow(row: ProposalRow): ProposalFormValues {
  const structure = (PAYMENT_STRUCTURE_VALUES as readonly string[]).includes(
    row.payment_structure
  )
    ? (row.payment_structure as PaymentStructure)
    : "custom";
  const usesDeposit =
    structure === "deposit_monthly" || structure === "deposit_quarterly";
  const discountPercent = Number(row.discount_percent);
  const storedLines = parseStoredSchedule(row.payment_schedule_json) ?? [];

  return {
    parentFirstName: row.parent_first_name,
    parentLastName: row.parent_last_name,
    parentEmail: row.parent_email,
    studentFirstName: row.student_first_name,
    studentLastName: row.student_last_name,
    graduationYear: String(row.graduation_year),
    title: row.title,
    introMessage: row.intro_message ?? "",
    servicesSummary: row.services_summary,
    totalCost: centsToInput(row.total_cost_cents),
    discountPercent: discountPercent > 0 ? String(discountPercent) : "",
    discountedCost: centsToInput(row.discounted_cost_cents),
    paymentOptions: paymentOptionFormValuesFromRow(row),
    paymentStructure: structure,
    balanceDueOn: structure === "half_half" ? (row.first_due_on ?? "") : "",
    depositAmount:
      usesDeposit && row.deposit_cents !== null ? centsToInput(row.deposit_cents) : "",
    installmentCount:
      usesDeposit && row.installment_count !== null
        ? String(row.installment_count)
        : "",
    firstPaymentOn: usesDeposit ? (row.first_due_on ?? "") : "",
    customLines:
      structure === "custom" && storedLines.length > 0
        ? storedLines.map((line, i) => ({
            key: `line-${i}`,
            label: line.label,
            amount: centsToInput(line.amountCents),
            atSigning: line.dueOn === null,
            dueOn: line.dueOn ?? "",
          }))
        : newProposalFormValues("2000-01-01").customLines,
    includeTestPrep: row.test_prep_lessons !== null,
    testPrepLessons: row.test_prep_lessons !== null ? String(row.test_prep_lessons) : "",
    additionalSessionRate:
      row.additional_session_rate_cents !== null
        ? centsToInput(row.additional_session_rate_cents)
        : "",
    termsAndConditions: row.terms_and_conditions ?? "",
    termsCustomized: true,
    validUntil: row.valid_until,
  };
}

/** The half/half due-by date in effect: the typed one, else the default. */
export function effectiveBalanceDueOn(
  values: Pick<ProposalFormValues, "balanceDueOn" | "graduationYear">,
  todayIso: string
): string {
  if (values.balanceDueOn) return values.balanceDueOn;
  const year = Number(values.graduationYear);
  return Number.isInteger(year) && year > 0 ? defaultBalanceDueOn(year, todayIso) : "";
}

/** The terms text in effect: the counselor's, else the starter terms. */
export function effectiveTerms(
  values: Pick<
    ProposalFormValues,
    "termsAndConditions" | "termsCustomized" | "includeTestPrep"
  >
): string {
  return values.termsCustomized
    ? values.termsAndConditions
    : defaultTermsAndConditions({ includesTestPrep: values.includeTestPrep });
}

/** The discounted cost in effect, in cents, or null while it can't be known. */
export function effectiveDiscountedCents(
  values: Pick<ProposalFormValues, "totalCost" | "discountPercent" | "discountedCost">
): number | null {
  const typed = values.discountedCost.trim();
  if (typed) return parseDollarsToCents(typed);
  const total = parseDollarsToCents(values.totalCost.trim());
  const percent = parsePercent(values.discountPercent);
  if (total === null || percent === null) return null;
  return applyDiscount(total, percent);
}

export interface ScheduleFields {
  depositCents: number | null;
  installmentCount: number | null;
  firstDueOn: string | null;
  customLines: ProposalInput["customLines"];
}

/**
 * Parse the inputs of the CHOSEN payment structure only (the other
 * structures' leftovers are ignored, and the server nulls them too). Used
 * by the save payload and by the form's live schedule preview, so the
 * preview is built from exactly what would be saved.
 */
export function scheduleFieldsFromForm(
  values: ProposalFormValues,
  todayIso: string
): { ok: true; fields: ScheduleFields } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const structure = values.paymentStructure;
  let depositCents: number | null = null;
  let installmentCount: number | null = null;
  let firstDueOn: string | null = null;
  const customLines: ProposalInput["customLines"] = [];

  if (structure === "half_half") {
    firstDueOn = effectiveBalanceDueOn(values, todayIso) || null;
  } else if (structure === "custom") {
    for (const [index, line] of values.customLines.entries()) {
      const n = index + 1;
      const typedAmount = line.amount.trim();
      // A blank amount is left for the schedule builder to report by name.
      const amountCents = typedAmount === "" ? 0 : parseDollarsToCents(typedAmount);
      if (amountCents === null) {
        return fail(`Payment ${n}: enter a valid amount`);
      }
      const atSigning = index === 0 && line.atSigning;
      if (index === 0 && !atSigning && !line.dueOn) {
        // Never read a missing date as "at signing" on the counselor's behalf.
        return fail("Payment 1 needs a due date, or mark it due at signing");
      }
      customLines.push({
        label: line.label,
        amountCents,
        dueOn: atSigning ? null : line.dueOn || null,
      });
    }
  } else {
    const typedDeposit = values.depositAmount.trim();
    if (typedDeposit !== "") {
      depositCents = parseDollarsToCents(typedDeposit);
      if (depositCents === null) return fail("Enter a valid deposit amount");
    }
    const typedCount = values.installmentCount.trim();
    if (typedCount !== "") {
      if (!/^\d{1,3}$/.test(typedCount)) {
        return fail("Enter the number of payments as a whole number");
      }
      installmentCount = Number(typedCount);
    }
    firstDueOn = values.firstPaymentOn || null;
  }
  return { ok: true, fields: { depositCents, installmentCount, firstDueOn, customLines } };
}

export type FormConversion =
  | { ok: true; input: ProposalInput }
  | { ok: false; error: string };

/**
 * Turn what was typed into the save payload. This only PARSES (a money
 * field that isn't money, a count that isn't a number); whether the parsed
 * proposal makes sense is `validateProposalInput`'s job, run on the result
 * by both the form and the server.
 */
export function proposalInputFromForm(
  values: ProposalFormValues,
  todayIso: string
): FormConversion {
  const fail = (error: string): FormConversion => ({ ok: false, error });

  const graduationYear = Number(values.graduationYear);
  if (!values.graduationYear || !Number.isInteger(graduationYear)) {
    return fail("Choose the student's graduation year");
  }

  const totalCostCents = parseDollarsToCents(values.totalCost.trim());
  if (totalCostCents === null || totalCostCents <= 0) {
    return fail("Enter the total cost");
  }
  const discountPercent = parsePercent(values.discountPercent);
  if (discountPercent === null) {
    return fail("Enter the discount as a percent between 0 and 99.99");
  }
  const discountedCostCents = effectiveDiscountedCents(values);
  if (discountedCostCents === null) {
    return fail("Enter a valid discounted cost");
  }

  const enabled = values.paymentOptions?.filter((option) => option.enabled);
  if (enabled?.length === 0) return fail("Enable at least one payment option");
  const paymentOptions = [];
  for (const option of enabled ?? [values]) {
    const parsed = scheduleFieldsFromForm({ ...values, ...option }, todayIso);
    if (!parsed.ok) return fail(`${enabled && enabled.length > 1 ? paymentOptionLabel(option.paymentStructure) + ": " : ""}${parsed.error}`);
    paymentOptions.push({ paymentStructure: option.paymentStructure, ...parsed.fields });
  }
  const primary = paymentOptions[0];

  let testPrepLessons: number | null = null;
  let additionalSessionRateCents: number | null = null;
  if (values.includeTestPrep) {
    const typedLessons = values.testPrepLessons.trim();
    if (!/^\d{1,4}$/.test(typedLessons)) {
      return fail("Enter how many test preparation lessons are included");
    }
    testPrepLessons = Number(typedLessons);
    const typedRate = values.additionalSessionRate.trim();
    if (typedRate !== "") {
      additionalSessionRateCents = parseDollarsToCents(typedRate);
      if (additionalSessionRateCents === null || additionalSessionRateCents <= 0) {
        return fail("Enter a valid cost for additional sessions, or leave it blank");
      }
    }
  }

  return {
    ok: true,
    input: {
      parentFirstName: values.parentFirstName,
      parentLastName: values.parentLastName,
      parentEmail: values.parentEmail,
      studentFirstName: values.studentFirstName,
      studentLastName: values.studentLastName,
      graduationYear,
      title: values.title,
      introMessage: values.introMessage,
      servicesSummary: values.servicesSummary,
      totalCostCents,
      discountPercent,
      discountedCostCents,
      ...primary,
      ...(enabled ? { paymentOptions } : {}),
      testPrepLessons,
      additionalSessionRateCents,
      termsAndConditions: effectiveTerms(values),
      validUntil: values.validUntil,
    },
  };
}
