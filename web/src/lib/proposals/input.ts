import { z } from "zod";
import {
  MAX_PROPOSAL_COST_CENTS,
  MAX_SESSION_RATE_CENTS,
  MAX_TEST_PREP_LESSONS,
  PAYMENT_STRUCTURE_VALUES,
} from "../constants/proposals";
import type { InstallmentLine } from "../agreements/schedule";
import { pricingProblem } from "./pricing";
import { paymentOptionLabel, type ProposalPaymentOption } from "./payment-options";
import {
  MAX_CUSTOM_LINES,
  buildProposalSchedule,
  isIsoDate,
  pastDueLines,
} from "./schedule";
import { formatLongDate } from "./terms";

/**
 * The proposal form's payload and its validation, shared by the client
 * (types only) and the save action (which never trusts a client-computed
 * price or schedule: everything derived is recomputed here from the raw
 * inputs). Unit-tested in tests/unit/proposals.test.ts.
 */

/** How many class years ahead a proposal may be written for. */
export const GRADUATION_YEAR_SPAN = 8;

const isoDate = z
  .string()
  .refine((value) => isIsoDate(value), { message: "Enter a valid date" });

const personName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(80, `${label} is too long`);

/** Blank optional text is stored as NULL, never as an empty string. */
const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (${max.toLocaleString("en-US")} characters at most)`)
    .nullable()
    .transform((value) => (value ? value : null));

export const paymentOptionInputSchema = z.object({
  paymentStructure: z.enum(PAYMENT_STRUCTURE_VALUES, {
    message: "Choose a payment structure",
  }),
  depositCents: z.number().int().nullable(),
  installmentCount: z.number().int().nullable(),
  firstDueOn: isoDate.nullable(),
  customLines: z
    .array(
      z.object({
        label: z.string().trim().max(120, "A payment description is too long"),
        amountCents: z.number().int(),
        dueOn: isoDate.nullable(),
      })
    )
    .max(MAX_CUSTOM_LINES, `At most ${MAX_CUSTOM_LINES} payments`),
});

export type PaymentOptionInput = z.input<typeof paymentOptionInputSchema>;

export const proposalInputSchema = z.object({
  parentFirstName: personName("Parent first name"),
  parentLastName: personName("Parent last name"),
  parentEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Parent email is too long")
    .email("Enter a valid parent email"),
  studentFirstName: personName("Student first name"),
  studentLastName: personName("Student last name"),
  graduationYear: z.number().int("Choose the student's graduation year"),

  title: z
    .string()
    .trim()
    .min(1, "Give the proposal a title")
    .max(120, "The title is too long"),
  introMessage: optionalText("The personal note", 2000),
  servicesSummary: z
    .string()
    .trim()
    .min(1, "Describe the services this proposal covers")
    .max(6000, "The services description is too long"),

  totalCostCents: z.number().int().max(MAX_PROPOSAL_COST_CENTS),
  discountPercent: z.number(),
  discountedCostCents: z.number().int(),

  ...paymentOptionInputSchema.shape,
  paymentOptions: z.array(paymentOptionInputSchema).min(1, "Enable at least one payment option").max(PAYMENT_STRUCTURE_VALUES.length).optional(),

  testPrepLessons: z
    .number()
    .int("Enter a whole number of lessons")
    .min(1, "Enter how many lessons are included, or turn test preparation off")
    .max(MAX_TEST_PREP_LESSONS, `At most ${MAX_TEST_PREP_LESSONS} lessons`)
    .nullable(),
  additionalSessionRateCents: z
    .number()
    .int()
    .positive("Enter the cost of an additional session, or leave it blank")
    .max(MAX_SESSION_RATE_CENTS, "The additional-session cost is too large")
    .nullable(),

  termsAndConditions: optionalText("The terms and conditions", 12000),
  validUntil: isoDate,
});

/** What the form submits. Money is integer cents; dates are YYYY-MM-DD. */
export type ProposalInput = z.input<typeof proposalInputSchema>;

/** A validated proposal: normalized fields plus the resolved schedule. */
export type ValidProposal = Omit<z.output<typeof proposalInputSchema>, "paymentOptions"> & {
  lines: InstallmentLine[];
  paymentOptions: ProposalPaymentOption[];
};

export type ProposalValidation =
  | { ok: true; value: ValidProposal }
  | { ok: false; error: string };

/**
 * Validate a proposal payload. `todayIso` is the firm-local calendar date.
 *
 * Every enabled option is rebuilt separately. Inputs for other structures
 * are normalized away, so no stale deposit or custom line can leak into
 * another option. Legacy single-schedule submissions stay supported.
 */
export function validateProposalInput(
  raw: unknown,
  todayIso: string
): ProposalValidation {
  const parsed = proposalInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the proposal" };
  }
  const input = parsed.data;

  const thisYear = Number(todayIso.slice(0, 4));
  if (
    input.graduationYear < thisYear ||
    input.graduationYear > thisYear + GRADUATION_YEAR_SPAN
  ) {
    return { ok: false, error: "Choose the student's graduation year" };
  }

  const priceError = pricingProblem({
    totalCents: input.totalCostCents,
    discountPercent: input.discountPercent,
    discountedCents: input.discountedCostCents,
  });
  if (priceError) return { ok: false, error: priceError };

  if (input.additionalSessionRateCents !== null && input.testPrepLessons === null) {
    // No silent discards (CLAUDE.md rule 7): the rate only means something
    // after an included lesson pack.
    return {
      ok: false,
      error:
        "The additional-session cost applies after an included lesson pack — add the number of lessons, or clear the cost",
    };
  }

  if (input.validUntil < todayIso) {
    return { ok: false, error: "The valid-through date has already passed" };
  }

  const offered = input.paymentOptions ?? [input];
  const options: ProposalPaymentOption[] = [];
  for (const option of offered) {
    if (options.some((existing) => existing.structure === option.paymentStructure)) {
      return { ok: false, error: "Each payment option can only be offered once" };
    }
    const usesDeposit = option.paymentStructure === "deposit_monthly" || option.paymentStructure === "deposit_quarterly";
    const normalized = {
      structure: option.paymentStructure,
      depositCents: usesDeposit ? option.depositCents : null,
      installmentCount: usesDeposit ? option.installmentCount : null,
      firstDueOn: option.paymentStructure === "custom" ? null : option.firstDueOn,
    };
    const schedule = buildProposalSchedule({
      ...normalized, totalCents: input.discountedCostCents,
      customLines: option.paymentStructure === "custom" ? option.customLines : [],
    });
    const prefix = offered.length > 1 ? `${paymentOptionLabel(option.paymentStructure)}: ` : "";
    if (!schedule.ok) return { ok: false, error: prefix + schedule.error };
    const stale = pastDueLines(schedule.lines, todayIso)[0];
    if (stale?.dueOn) return { ok: false, error: `${prefix}A payment date has already passed (${formatLongDate(stale.dueOn)}) — choose a later date` };
    options.push({ ...normalized, lines: schedule.lines });
  }
  const first = options[0];
  return { ok: true, value: {
    ...input, paymentStructure: first.structure,
    depositCents: first.depositCents, installmentCount: first.installmentCount,
    firstDueOn: first.firstDueOn,
    customLines: first.structure === "custom" ? offered[0].customLines : [],
    lines: first.lines, paymentOptions: options,
  } };
}

/** The class years a proposal can be written for, soonest first. */
export function graduationYearOptions(todayIso: string): number[] {
  const thisYear = Number(todayIso.slice(0, 4));
  return Array.from({ length: GRADUATION_YEAR_SPAN + 1 }, (_, i) => thisYear + i);
}
