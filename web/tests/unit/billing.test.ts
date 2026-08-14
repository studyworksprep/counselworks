import { describe, expect, it } from "vitest";
import {
  invoiceDueOn,
  isInvoiceOverdue,
  nextInvoiceNumbers,
} from "@/lib/billing/invoices";
import { renderInvoicePdf } from "@/lib/billing/pdf";

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
