/**
 * Single source of truth for financial-aid enums and net-cost math
 * (fix plan 10.6; CLAUDE.md rule 4). Amounts are annual whole USD.
 */

export const AID_KINDS = [
  { value: "merit", label: "Merit scholarship", gift: true },
  { value: "need", label: "Need-based grant", gift: true },
  { value: "loan", label: "Loan", gift: false },
  { value: "work_study", label: "Work-study", gift: false },
  { value: "other", label: "Other", gift: false },
] as const;

export const AID_KIND_VALUES = new Set<string>(AID_KINDS.map((k) => k.value));

export const AID_KIND_LABELS: Record<string, string> = Object.fromEntries(
  AID_KINDS.map((k) => [k.value, k.label])
);

/** Gift aid (grants/scholarships) reduces net cost; loans and work-study
 * are financing, not discounts, and are totalled separately. */
const GIFT_KINDS = new Set(
  AID_KINDS.filter((k) => k.gift).map((k) => k.value as string)
);

export function isGiftAid(kind: string): boolean {
  return GIFT_KINDS.has(kind);
}

export interface AidAwardLike {
  kind: string;
  annual_amount: number;
}

export interface NetCostInput {
  /** From the award letter (applications.cost_of_attendance). */
  costOfAttendance: number | null;
  /** Catalog fallbacks (colleges.tuition_out_state / net_price_avg). */
  tuitionEstimate: number | null;
  awards: AidAwardLike[];
}

export interface NetCostResult {
  /** The cost basis used, or null when nothing is known. */
  cost: number | null;
  costSource: "award_letter" | "tuition_estimate" | null;
  giftAid: number;
  otherAid: number;
  /** cost - giftAid, floored at 0; null when cost is unknown. */
  netCost: number | null;
}

export function computeNetCost(input: NetCostInput): NetCostResult {
  const giftAid = input.awards
    .filter((a) => isGiftAid(a.kind))
    .reduce((sum, a) => sum + Math.max(0, a.annual_amount), 0);
  const otherAid = input.awards
    .filter((a) => !isGiftAid(a.kind))
    .reduce((sum, a) => sum + Math.max(0, a.annual_amount), 0);

  let cost: number | null = null;
  let costSource: NetCostResult["costSource"] = null;
  if (input.costOfAttendance != null && input.costOfAttendance >= 0) {
    cost = input.costOfAttendance;
    costSource = "award_letter";
  } else if (input.tuitionEstimate != null && input.tuitionEstimate > 0) {
    cost = input.tuitionEstimate;
    costSource = "tuition_estimate";
  }

  return {
    cost,
    costSource,
    giftAid,
    otherAid,
    netCost: cost == null ? null : Math.max(0, cost - giftAid),
  };
}

export function formatUsd(amount: number | null): string {
  if (amount == null) return "—";
  return `$${amount.toLocaleString("en-US")}`;
}

export interface TuitionShape {
  tuition_in_state: number | null;
  tuition_out_state: number | null;
  state_region: string | null;
}

/**
 * Choose the tuition estimate used when no award-letter cost of attendance
 * is recorded (fix plan 11.4). When the student's home state matches the
 * college's state, use in-state tuition; otherwise out-of-state. Falls back
 * across whichever value is present.
 */
export function pickTuitionEstimate(
  college: TuitionShape | null,
  studentState: string | null
): number | null {
  if (!college) return null;
  const inState =
    !!studentState &&
    !!college.state_region &&
    studentState.trim().toLowerCase() === college.state_region.trim().toLowerCase();
  if (inState && college.tuition_in_state != null) {
    return college.tuition_in_state;
  }
  return college.tuition_out_state ?? college.tuition_in_state ?? null;
}
