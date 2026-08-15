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

import { checkoutSessionMismatch } from "@/lib/payments/checkout";

describe("webhook checkout-session guard (fix plan 12.4)", () => {
  const invoice = { id: "inv-1", status: "open", amount_cents: 300000 };
  const session = {
    payment_status: "paid",
    amount_total: 300000,
    metadata: {
      counselworks_invoice_id: "inv-1",
      counselworks_firm_id: "firm-1",
    },
  };
  const expected = {
    firmId: "firm-1",
    eventAccountId: "acct_1",
    firmAccountId: "acct_1",
  };

  it("accepts a fully matching paid session", () => {
    expect(checkoutSessionMismatch(session, invoice, expected)).toBeNull();
  });

  it("refuses unpaid, mismatched, or cross-account sessions", () => {
    expect(
      checkoutSessionMismatch(
        { ...session, payment_status: "unpaid" },
        invoice,
        expected
      )
    ).toMatch(/payment_status/);
    expect(
      checkoutSessionMismatch(
        { ...session, metadata: { ...session.metadata, counselworks_invoice_id: "other" } },
        invoice,
        expected
      )
    ).toMatch(/invoice metadata/);
    expect(
      checkoutSessionMismatch(
        { ...session, metadata: { ...session.metadata, counselworks_firm_id: "other" } },
        invoice,
        expected
      )
    ).toMatch(/firm metadata/);
    // A forged event from some other connected account must never match.
    expect(
      checkoutSessionMismatch(session, invoice, {
        ...expected,
        eventAccountId: "acct_attacker",
      })
    ).toMatch(/does not match/);
    expect(
      checkoutSessionMismatch(session, invoice, {
        ...expected,
        firmAccountId: null,
      })
    ).toMatch(/does not match/);
    expect(
      checkoutSessionMismatch(
        { ...session, amount_total: 1 },
        invoice,
        expected
      )
    ).toMatch(/amount mismatch/);
    expect(
      checkoutSessionMismatch(session, { ...invoice, status: "void" }, expected)
    ).toMatch(/void/);
  });

  it("redelivery against an already-paid invoice passes the guard (idempotency lives at the unique constraint)", () => {
    expect(
      checkoutSessionMismatch(session, { ...invoice, status: "paid" }, expected)
    ).toBeNull();
  });
});
