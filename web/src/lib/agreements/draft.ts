import { z } from "zod";
import { MAX_INSTALLMENTS } from "../constants/billing";
import { parseDollarsToCents, type InstallmentLine } from "./schedule";
import type { AgreementFeeTerms } from "./snapshot";

export interface AgreementDraftTerms {
  totalFee: string;
  servicesSummary: string;
  testPrepLessons: string;
  additionalSessionRate: string;
  additionalTerms: string;
  payments: { key: string; label: string; amount: string; atSigning: boolean; dueOn: string }[];
}

export function initialAgreementTerms(source: {
  totalFeeCents: number; servicesSummary: string; testPrepLessons: number | null;
  additionalSessionRateCents: number | null; lines: InstallmentLine[];
}): AgreementDraftTerms {
  return {
    totalFee: (source.totalFeeCents / 100).toFixed(2), servicesSummary: source.servicesSummary,
    testPrepLessons: String(source.testPrepLessons ?? 0),
    additionalSessionRate: source.additionalSessionRateCents === null ? "" : (source.additionalSessionRateCents / 100).toFixed(2),
    additionalTerms: "",
    payments: source.lines.map((line) => ({ key: `payment-${line.installmentNumber}`,
      // Generated half/half labels contain a literal date. The editable schedule owns that date.
      label: line.label.startsWith("Second half (when the final application")
        ? "Second half (when the final application is submitted or the scheduled due date, whichever comes first)"
        : line.label.replace(/ \(due at signing\)$/, ""),
      amount: (line.amountCents / 100).toFixed(2), atSigning: line.isRetainer, dueOn: line.dueOn ?? "" })),
  };
}

const schema = z.object({
  totalFee: z.string().trim().max(40), servicesSummary: z.string().trim().min(1).max(10000),
  testPrepLessons: z.string().trim().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(500)),
  additionalSessionRate: z.string().trim().max(40), additionalTerms: z.string().trim().max(10000),
  payments: z.array(z.object({ label: z.string().trim().min(1).max(200), amount: z.string().trim().max(40),
    atSigning: z.boolean(), dueOn: z.union([z.literal(""), z.iso.date()]),
  })).min(1).max(MAX_INSTALLMENTS + 1),
});

export interface ParsedAgreementTerms {
  feeTerms: AgreementFeeTerms;
  servicesSummary: string;
  testPrepLessons: number | null;
  additionalSessionRateCents: number | null;
  additionalTerms: string;
}

/** Treat posted terms as raw input; rebuild all amounts, numbering and schedule invariants. */
export function parseAgreementTerms(raw: FormDataEntryValue): ParsedAgreementTerms | { error: string } {
  if (typeof raw !== "string" || raw.length > 50000) return { error: "Check the agreement terms" };
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return { error: "The agreement terms could not be read" }; }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Check the services, lessons and payment details. Each payment needs a label, amount and valid date or 'due when fully signed'." };
  const terms = parsed.data;
  const total = parseDollarsToCents(terms.totalFee);
  if (total === null || !Number.isSafeInteger(total) || total <= 0 || total > 2147483647) return { error: "Enter a valid total engagement fee" };
  const lines: InstallmentLine[] = [];
  let lastDue = "";
  for (const [index, payment] of terms.payments.entries()) {
    const amount = parseDollarsToCents(payment.amount);
    if (amount === null || !Number.isSafeInteger(amount) || amount <= 0 || amount > total) return { error: `Enter a valid amount for payment ${index + 1}` };
    if (payment.atSigning && index !== 0) return { error: "Only the first payment can be due when fully signed" };
    if (!payment.atSigning && !payment.dueOn) return { error: `Choose a date for payment ${index + 1}` };
    if (!payment.atSigning && payment.dueOn < lastDue) return { error: "Put payment dates in chronological order" };
    if (!payment.atSigning) lastDue = payment.dueOn;
    lines.push({ installmentNumber: index + 1, label: payment.label, amountCents: amount,
      isRetainer: payment.atSigning, dueOn: payment.atSigning ? null : payment.dueOn });
  }
  if (lines.reduce((sum, line) => sum + line.amountCents, 0) !== total) return { error: "The payment amounts must add up to the total engagement fee" };
  const rate = terms.additionalSessionRate ? parseDollarsToCents(terms.additionalSessionRate) : null;
  if (terms.additionalSessionRate && (rate === null || rate <= 0 || !Number.isSafeInteger(rate) || rate > 2147483647)) return { error: "Enter a valid additional-session rate" };
  if (rate !== null && terms.testPrepLessons === 0) return { error: "Include test preparation lessons or clear the additional-session rate" };
  return { feeTerms: { totalFeeCents: total, retainerCents: lines[0].isRetainer ? lines[0].amountCents : 0, lines },
    servicesSummary: terms.servicesSummary, testPrepLessons: terms.testPrepLessons || null,
    additionalSessionRateCents: rate, additionalTerms: terms.additionalTerms };
}
