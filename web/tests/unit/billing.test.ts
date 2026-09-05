import { describe, expect, it } from "vitest";
import {
  invoiceDueOn,
  isInvoiceOverdue,
  nextInvoiceNumbers,
} from "@/lib/billing/invoices";
import { renderInvoicePdf } from "@/lib/billing/pdf";
import {
  agingBucketFor,
  daysPastDue,
  isReminderDay,
  summarizeReceivables,
} from "@/lib/billing/aging";

describe("invoice numbering (fix plan 12.3)", () => {
  it("starts at INV-0001 and continues from the highest existing number", () => {
    expect(nextInvoiceNumbers([], 2)).toEqual(["INV-0001", "INV-0002"]);
    expect(nextInvoiceNumbers(["INV-0002", "INV-0007"], 3)).toEqual([
      "INV-0008",
      "INV-0009",
      "INV-0010",
    ]);
  });

  it("ignores non-conforming numbers and grows past the pad width", () => {
    expect(nextInvoiceNumbers(["legacy-12", "", "INV-9999"], 2)).toEqual([
      "INV-10000",
      "INV-10001",
    ]);
  });
});

describe("invoice due dates", () => {
  it("retainer is due on the execution date; installments keep their own", () => {
    expect(
      invoiceDueOn({ is_retainer: true, due_on: null }, "2026-08-14")
    ).toBe("2026-08-14");
    expect(
      invoiceDueOn({ is_retainer: false, due_on: "2027-01-15" }, "2026-08-14")
    ).toBe("2027-01-15");
    // Defensive: a dateless non-retainer line falls back to execution.
    expect(
      invoiceDueOn({ is_retainer: false, due_on: null }, "2026-08-14")
    ).toBe("2026-08-14");
  });
});

describe("overdue derivation", () => {
  it("open past due is overdue; due today, paid, and void are not", () => {
    expect(
      isInvoiceOverdue({ status: "open", due_on: "2026-08-13" }, "2026-08-14")
    ).toBe(true);
    expect(
      isInvoiceOverdue({ status: "open", due_on: "2026-08-14" }, "2026-08-14")
    ).toBe(false);
    expect(
      isInvoiceOverdue({ status: "paid", due_on: "2026-08-13" }, "2026-08-14")
    ).toBe(false);
    expect(
      isInvoiceOverdue({ status: "void", due_on: "2026-08-13" }, "2026-08-14")
    ).toBe(false);
  });
});

describe("invoice PDF", () => {
  it("renders a non-empty PDF", async () => {
    const bytes = await renderInvoicePdf({
      firmName: "Acme Counseling",
      invoiceNumber: "INV-0042",
      familyName: "The Riveras",
      agreementTitle: "Comprehensive Engagement",
      installmentLabel: "Installment 2 of 5",
      amountCents: 180000,
      issuedOn: "2026-08-14",
      dueOn: "2026-09-15",
    });
    expect(bytes.byteLength).toBeGreaterThan(500);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("receivables aging (fix plan 12.6)", () => {
  it("counts whole days past due in UTC, negative before the due date", () => {
    expect(daysPastDue("2026-09-05", "2026-09-05")).toBe(0);
    expect(daysPastDue("2026-09-04", "2026-09-05")).toBe(1);
    expect(daysPastDue("2026-09-06", "2026-09-05")).toBe(-1);
    // Crosses a month and a DST boundary without drifting.
    expect(daysPastDue("2026-03-01", "2026-04-01")).toBe(31);
  });

  it("buckets by days past due, with not-yet-due as current", () => {
    const today = "2026-09-05";
    expect(agingBucketFor("2026-10-01", today)).toBe("current");
    expect(agingBucketFor("2026-09-05", today)).toBe("current");
    expect(agingBucketFor("2026-09-04", today)).toBe("1_30");
    expect(agingBucketFor("2026-08-06", today)).toBe("1_30");
    expect(agingBucketFor("2026-08-05", today)).toBe("31_60");
    expect(agingBucketFor("2026-07-07", today)).toBe("31_60");
    expect(agingBucketFor("2026-07-06", today)).toBe("61_90");
    expect(agingBucketFor("2026-06-07", today)).toBe("61_90");
    expect(agingBucketFor("2026-06-06", today)).toBe("over_90");
    expect(agingBucketFor("2025-01-01", today)).toBe("over_90");
  });

  it("rolls invoices into balance, overdue, aging and paid totals", () => {
    const today = "2026-09-05";
    const s = summarizeReceivables(
      [
        { status: "paid", amount_cents: 300000, due_on: "2026-08-01", paid_at: "2026-08-02T10:00:00Z" },
        { status: "paid", amount_cents: 100000, due_on: "2026-08-15", paid_at: "2026-08-20T10:00:00Z" },
        { status: "open", amount_cents: 450000, due_on: "2026-10-15" },
        { status: "open", amount_cents: 450000, due_on: "2026-08-20" },
        { status: "open", amount_cents: 200000, due_on: "2026-05-01" },
        { status: "void", amount_cents: 999999, due_on: "2026-01-01" },
      ],
      today
    );
    expect(s.open_cents).toBe(1100000);
    expect(s.open_count).toBe(3);
    expect(s.overdue_cents).toBe(650000);
    expect(s.overdue_count).toBe(2);
    expect(s.oldest_overdue_days).toBe(127);
    expect(s.paid_cents).toBe(400000);
    expect(s.last_paid_at).toBe("2026-08-20T10:00:00Z");
    expect(s.aging).toEqual({
      current: 450000,
      "1_30": 450000,
      "31_60": 0,
      "61_90": 0,
      over_90: 200000,
    });
  });

  it("an empty or fully paid ledger has a zero balance", () => {
    const s = summarizeReceivables(
      [{ status: "paid", amount_cents: 1, due_on: "2026-01-01", paid_at: null }],
      "2026-09-05"
    );
    expect(s.open_cents).toBe(0);
    expect(s.overdue_count).toBe(0);
    expect(s.oldest_overdue_days).toBe(0);
    expect(s.last_paid_at).toBeNull();
    expect(summarizeReceivables([], "2026-09-05").paid_cents).toBe(0);
  });
});

describe("overdue reminder cadence", () => {
  it("reminds on day 1, weekly to day 30, then every 30 days — never before due", () => {
    const days = Array.from({ length: 130 }, (_, i) => i - 5).filter(isReminderDay);
    expect(days).toEqual([1, 7, 14, 21, 30, 60, 90, 120]);
  });
});
