import { describe, expect, it } from "vitest";
import { deriveOnboardingState } from "@/lib/payments/status";

describe("Stripe onboarding state derivation (fix plan 12.4)", () => {
  it("no account → not_connected", () => {
    expect(deriveOnboardingState(null)).toBe("not_connected");
    expect(
      deriveOnboardingState({
        connected: false,
        chargesEnabled: false,
        detailsSubmitted: false,
        currentlyDue: 0,
      })
    ).toBe("not_connected");
  });

  it("connected but unfinished or re-flagged → onboarding_incomplete", () => {
    const base = {
      connected: true,
      chargesEnabled: true,
      detailsSubmitted: true,
      currentlyDue: 0,
    };
    expect(
      deriveOnboardingState({ ...base, detailsSubmitted: false })
    ).toBe("onboarding_incomplete");
    expect(
      deriveOnboardingState({ ...base, chargesEnabled: false })
    ).toBe("onboarding_incomplete");
    // Stripe can re-request information later; treat it as incomplete so
    // the Settings card surfaces "Resume onboarding".
    expect(deriveOnboardingState({ ...base, currentlyDue: 2 })).toBe(
      "onboarding_incomplete"
    );
  });

  it("fully onboarded → active", () => {
    expect(
      deriveOnboardingState({
        connected: true,
        chargesEnabled: true,
        detailsSubmitted: true,
        currentlyDue: 0,
      })
    ).toBe("active");
  });
});
