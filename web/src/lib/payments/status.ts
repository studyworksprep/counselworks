import type { StripeAccountStatus } from "./connect";

/**
 * Pure onboarding-state derivation (fix plan 12.4), unit-tested in
 * tests/unit/payments.test.ts. Drives the Settings "Payments" card.
 */
export type StripeOnboardingState =
  | "not_connected"
  | "onboarding_incomplete"
  | "active";

export function deriveOnboardingState(
  status: (StripeAccountStatus & { connected: boolean }) | null
): StripeOnboardingState {
  if (!status || !status.connected) return "not_connected";
  if (
    !status.chargesEnabled ||
    !status.detailsSubmitted ||
    status.currentlyDue > 0
  ) {
    return "onboarding_incomplete";
  }
  return "active";
}
