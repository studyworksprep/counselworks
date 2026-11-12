import { MAX_PROPOSAL_COST_CENTS } from "../constants/proposals";

/**
 * Pure proposal-pricing helpers, unit-tested in tests/unit/proposals.test.ts.
 * The proposal form (live preview) and the save action both run these, so
 * the numbers a counselor sees are exactly the numbers that get stored.
 *
 * All money is integer cents, USD. A discount percent carries at most two
 * decimal places and is handled as integer "basis points" (hundredths of a
 * percent) so no floating-point drift can reach a price.
 */

/** 12.5 → 1250. Null when out of range (0 ≤ p < 100) or finer than 0.01%. */
export function percentToBasisPoints(percent: number): number | null {
  if (!Number.isFinite(percent) || percent < 0 || percent >= 100) return null;
  const bp = Math.round(percent * 100);
  if (Math.abs(percent * 100 - bp) > 1e-6) return null;
  return bp;
}

/** The price after a percent discount, rounded to the nearest cent. */
export function applyDiscount(totalCents: number, discountPercent: number): number {
  const bp = percentToBasisPoints(discountPercent);
  if (bp === null) return totalCents;
  return Math.round((totalCents * (10000 - bp)) / 10000);
}

/** The percent (two decimals at most) that a discounted price represents. */
export function discountPercentFor(
  totalCents: number,
  discountedCents: number
): number {
  if (totalCents <= 0) return 0;
  return Math.round(((totalCents - discountedCents) * 10000) / totalCents) / 100;
}

/**
 * Parse a user-entered percent ("10", "12.5%", ""). Blank means no
 * discount. Null for anything that isn't 0–99.99 with ≤ 2 decimals.
 */
export function parsePercent(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** "10%", "12.5%", "13.04%" — trailing zeros dropped. */
export function formatPercent(percent: number): string {
  return `${Number(percent.toFixed(2))}%`;
}

/**
 * Why a total / discount percent / discounted cost triple can't be saved,
 * or null when it is coherent.
 *
 * The form lets the counselor type EITHER the percent (the discounted cost
 * follows) OR the discounted cost (the percent follows), so the two must
 * agree in at least one direction: the cost is the percent applied to the
 * total, or the percent is the cost's discount rounded to two decimals.
 * Anything else means a stale or hand-edited value and is refused rather
 * than stored as a price that contradicts its own label.
 */
export function pricingProblem(p: {
  totalCents: number;
  discountPercent: number;
  discountedCents: number;
}): string | null {
  const { totalCents, discountPercent, discountedCents } = p;
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    return "Enter the total cost";
  }
  if (totalCents > MAX_PROPOSAL_COST_CENTS) {
    return "The total cost is too large — check the amount";
  }
  const bp = percentToBasisPoints(discountPercent);
  if (bp === null) {
    return "The discount must be between 0 and 99.99%, with at most two decimal places";
  }
  if (!Number.isInteger(discountedCents) || discountedCents <= 0) {
    return "The discounted cost must be more than $0";
  }
  if (discountedCents > totalCents) {
    return "The discounted cost cannot be more than the total cost";
  }
  const percentGivesCost =
    discountedCents === Math.round((totalCents * (10000 - bp)) / 10000);
  const costGivesPercent =
    bp === Math.round(((totalCents - discountedCents) * 10000) / totalCents);
  if (!percentGivesCost && !costGivesPercent) {
    return "The discount percent and the discounted cost don't match — re-enter one of them";
  }
  return null;
}
