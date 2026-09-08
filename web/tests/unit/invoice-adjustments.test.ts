import { describe, expect, it } from "vitest";
import { invoiceBalanceCents, summarizeReceivables } from "@/lib/billing/aging";
import {
  adjustmentProblem,
  invoiceDisplayStatus,
  parseDollarsToCents,
  partialPaymentProblem,
  voidProblem,
} from "@/lib/billing/invoices";
import {
  INVOICE_DISPLAY_STATUSES,
  MANUAL_PAYMENT_METHOD_VALUES,
  MIN_PARTIAL_PAYMENT_CENTS,
} from "@/lib/constants/billing";

const today = "2026-09-08";
const open = { status: "open", amount_cents: 450000, due_on: "2026-10-15" };

describe("invoice ledger balance (post-plan adjustments)", () => {
  it("subtracts payments and credits, never below zero, and void owes nothing", () => {
    expect(invoiceBalanceCents(open)).toBe(450000);
    expect(invoiceBalanceCents({ ...open, paid_cents: 100000 })).toBe(350000);
    expect(invoiceBalanceCents({ ...open, paid_cents: 100000, credited_cents: 50000 })).toBe(300000);
    expect(invoiceBalanceCents({ ...open, paid_cents: 500000 })).toBe(0);
    expect(invoiceBalanceCents({ ...open, status: "void" })).toBe(0);
  });

  it("receivables count open invoices by remaining balance and money received separately", () => {
    const s = summarizeReceivables(
      [
        { ...open, paid_cents: 100000, credited_cents: 50000 },
        { status: "open", amount_cents: 200000, due_on: "2026-08-01", paid_cents: 150000 },
        { status: "paid", amount_cents: 300000, due_on: "2026-07-01", paid_cents: 300000, paid_at: "2026-07-02T00:00:00Z" },
        { status: "paid", amount_cents: 100000, due_on: "2026-07-01", paid_cents: 0, credited_cents: 100000, paid_at: "2026-07-05T00:00:00Z" },
        { status: "void", amount_cents: 999999, due_on: "2026-01-01" },
      ],
      today
    );
    expect(s.open_cents).toBe(350000);
    expect(s.open_count).toBe(2);
    expect(s.overdue_cents).toBe(50000);
    expect(s.overdue_count).toBe(1);
    expect(s.paid_cents).toBe(550000);
    expect(s.credited_cents).toBe(150000);
    expect(s.aging.current).toBe(300000);
    expect(s.aging["31_60"]).toBe(50000);
  });

  it("keeps the v1 shape working: paid means paid in full, open means nothing paid", () => {
    const s = summarizeReceivables(
      [
        { status: "paid", amount_cents: 300000, due_on: "2026-08-01" },
        { status: "open", amount_cents: 450000, due_on: "2026-10-15" },
      ],
      today
    );
    expect(s.paid_cents).toBe(300000);
    expect(s.open_cents).toBe(450000);
  });
});

describe("invoice display status", () => {
  it("derives partial and overdue; stored paid/void win", () => {
    expect(invoiceDisplayStatus(open, today)).toBe("open");
    expect(invoiceDisplayStatus({ ...open, paid_cents: 1 }, today)).toBe("partial");
    expect(invoiceDisplayStatus({ ...open, credited_cents: 1 }, today)).toBe("partial");
    expect(invoiceDisplayStatus({ ...open, due_on: "2026-09-01", paid_cents: 1 }, today)).toBe("overdue");
    expect(invoiceDisplayStatus({ ...open, status: "paid" }, today)).toBe("paid");
    expect(invoiceDisplayStatus({ ...open, status: "void", due_on: "2026-01-01" }, today)).toBe("void");
  });
  it("every display status has a label and badge", () => {
    for (const s of INVOICE_DISPLAY_STATUSES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.badge.length).toBeGreaterThan(0);
    }
  });
});

describe("payment and adjustment validation", () => {
  it("online partial payments respect the floor and the balance", () => {
    expect(partialPaymentProblem(450000, open)).toBeNull();
    expect(partialPaymentProblem(MIN_PARTIAL_PAYMENT_CENTS, open)).toBeNull();
    expect(partialPaymentProblem(MIN_PARTIAL_PAYMENT_CENTS - 1, open)).toMatch(/minimum/);
    expect(partialPaymentProblem(450001, open)).toMatch(/more than/);
    expect(partialPaymentProblem(0, open)).toMatch(/Enter/);
    expect(partialPaymentProblem(100.5, open)).toMatch(/Enter/);
    // A tiny remaining balance may be paid off exactly.
    expect(partialPaymentProblem(500, { ...open, paid_cents: 449500 })).toBeNull();
    expect(partialPaymentProblem(1, { ...open, status: "paid" })).toMatch(/cannot be paid/);
  });
  it("staff adjustments must fit the remaining balance", () => {
    expect(adjustmentProblem(1, open)).toBeNull();
    expect(adjustmentProblem(450000, open)).toBeNull();
    expect(adjustmentProblem(450001, open)).toMatch(/more than/);
    expect(adjustmentProblem(1, { ...open, paid_cents: 400000, credited_cents: 50000, status: "paid" })).toMatch(/settled/);
    expect(adjustmentProblem(1, { ...open, status: "void" })).toMatch(/void/);
    expect(adjustmentProblem(-5, open)).toMatch(/Enter/);
  });
  it("void is refused once anything has been paid", () => {
    expect(voidProblem(open)).toBeNull();
    expect(voidProblem({ ...open, credited_cents: 100 })).toBeNull();
    expect(voidProblem({ ...open, paid_cents: 100 })).toMatch(/credit/);
    expect(voidProblem({ ...open, status: "void" })).toMatch(/already void/);
    expect(voidProblem({ ...open, status: "paid" })).toMatch(/settled/);
  });
  it("parses dollar input to cents", () => {
    expect(parseDollarsToCents("1,234.56")).toBe(123456);
    expect(parseDollarsToCents("$25")).toBe(2500);
    expect(parseDollarsToCents("25.5")).toBe(2550);
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("1.234")).toBeNull();
  });
  it("manual methods exclude card", () => {
    expect(MANUAL_PAYMENT_METHOD_VALUES.has("card")).toBe(false);
    expect(MANUAL_PAYMENT_METHOD_VALUES.has("check")).toBe(true);
  });
});
