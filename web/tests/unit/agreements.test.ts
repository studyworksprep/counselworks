import { describe, expect, it } from "vitest";
import {
  renderAgreementBody,
  nextAgreementStatus,
} from "@/lib/agreements/render";
import {
  buildInstallmentSchedule,
  formatCents,
  parseDollarsToCents,
  renderFeeTermsSection,
} from "@/lib/agreements/schedule";
import { renderSignedAgreementPdf } from "@/lib/agreements/pdf";

describe("agreement template rendering (fix plan 10.1)", () => {
  it("substitutes every supported placeholder, everywhere it appears", () => {
    const out = renderAgreementBody(
      "{{firm_name}} agrees with {{family_name}} on {{date}}. Signed, {{firm_name}}.",
      { firm_name: "Acme Counseling", family_name: "The Lees", date: "July 12, 2026" }
    );
    expect(out).toBe(
      "Acme Counseling agrees with The Lees on July 12, 2026. Signed, Acme Counseling."
    );
  });
});

describe("agreement signing state machine", () => {
  it("one signature → partially signed; both → completed", () => {
    expect(nextAgreementStatus("sent", new Set(["firm"]))).toBe(
      "partially_signed"
    );
    expect(nextAgreementStatus("sent", new Set(["family"]))).toBe(
      "partially_signed"
    );
    expect(
      nextAgreementStatus("partially_signed", new Set(["firm", "family"]))
    ).toBe("completed");
  });

  it("completed and voided agreements accept no further signatures", () => {
    expect(() =>
      nextAgreementStatus("completed", new Set(["firm", "family"]))
    ).toThrow(/completed/);
    expect(() => nextAgreementStatus("voided", new Set(["firm"]))).toThrow(
      /voided/
    );
  });
});

describe("dollar parsing and formatting (fix plan 12.2)", () => {
  it("parses plain, formatted, and fractional amounts to cents", () => {
    expect(parseDollarsToCents("12000")).toBe(1200000);
    expect(parseDollarsToCents("$12,000")).toBe(1200000);
    expect(parseDollarsToCents("1250.50")).toBe(125050);
    expect(parseDollarsToCents("0.5")).toBe(50);
    expect(parseDollarsToCents("0")).toBe(0);
  });

  it("rejects junk", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("12.345")).toBeNull();
    expect(parseDollarsToCents("-100")).toBeNull();
    expect(parseDollarsToCents("12k")).toBeNull();
  });

  it("formats cents as USD", () => {
    expect(formatCents(1200000)).toBe("$12,000.00");
    expect(formatCents(50)).toBe("$0.50");
  });
});

describe("installment schedule builder (fix plan 12.1/12.2)", () => {
  it("builds retainer + even installments on the chosen cadence", () => {
    const result = buildInstallmentSchedule({
      totalFeeCents: 1200000,
      retainerCents: 300000,
      installmentCount: 2,
      firstDueOn: "2026-09-15",
      frequency: "monthly",
    });
    expect(result).toEqual({
      ok: true,
      lines: [
        {
          installmentNumber: 1,
          label: "Retainer (due at signing)",
          amountCents: 300000,
          isRetainer: true,
          dueOn: null,
        },
        {
          installmentNumber: 2,
          label: "Installment 1 of 2",
          amountCents: 450000,
          isRetainer: false,
          dueOn: "2026-09-15",
        },
        {
          installmentNumber: 3,
          label: "Installment 2 of 2",
          amountCents: 450000,
          isRetainer: false,
          dueOn: "2026-10-15",
        },
      ],
    });
  });

  it("quarterly cadence steps three months; no retainer means no retainer line", () => {
    const result = buildInstallmentSchedule({
      totalFeeCents: 900000,
      retainerCents: 0,
      installmentCount: 3,
      firstDueOn: "2026-11-30",
      frequency: "quarterly",
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.lines.map((l) => l.dueOn)).toEqual([
      "2026-11-30",
      "2027-02-28", // clamped: February has no 30th
      "2027-05-30",
    ]);
    expect(result.lines[0].installmentNumber).toBe(1);
    expect(result.lines.every((l) => !l.isRetainer)).toBe(true);
  });

  it("distributes cent rounding to the earliest installments and sums exactly", () => {
    const result = buildInstallmentSchedule({
      totalFeeCents: 100001, // $1,000.01
      retainerCents: 0,
      installmentCount: 3,
      firstDueOn: "2026-09-01",
      frequency: "monthly",
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.lines.map((l) => l.amountCents)).toEqual([33334, 33334, 33333]);
    expect(result.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(100001);
  });

  it("retainer covering the full fee needs zero installments", () => {
    const paidUpFront = buildInstallmentSchedule({
      totalFeeCents: 500000,
      retainerCents: 500000,
      installmentCount: 0,
      firstDueOn: null,
      frequency: null,
    });
    if (!paidUpFront.ok) throw new Error(paidUpFront.error);
    expect(paidUpFront.lines).toHaveLength(1);
    expect(paidUpFront.lines[0].isRetainer).toBe(true);

    expect(
      buildInstallmentSchedule({
        totalFeeCents: 500000,
        retainerCents: 500000,
        installmentCount: 2,
        firstDueOn: "2026-09-01",
        frequency: "monthly",
      })
    ).toMatchObject({ ok: false });
  });

  it("rejects incoherent inputs", () => {
    const cases: Parameters<typeof buildInstallmentSchedule>[0][] = [
      // retainer above total
      { totalFeeCents: 100, retainerCents: 200, installmentCount: 0, firstDueOn: null, frequency: null },
      // remainder with no installments
      { totalFeeCents: 100000, retainerCents: 0, installmentCount: 0, firstDueOn: null, frequency: null },
      // missing due date
      { totalFeeCents: 100000, retainerCents: 0, installmentCount: 2, firstDueOn: null, frequency: "monthly" },
      // missing frequency
      { totalFeeCents: 100000, retainerCents: 0, installmentCount: 2, firstDueOn: "2026-09-01", frequency: null },
      // absurd count
      { totalFeeCents: 100000, retainerCents: 0, installmentCount: 37, firstDueOn: "2026-09-01", frequency: "monthly" },
      // zero total
      { totalFeeCents: 0, retainerCents: 0, installmentCount: 0, firstDueOn: null, frequency: null },
    ];
    for (const input of cases) {
      expect(buildInstallmentSchedule(input)).toMatchObject({ ok: false });
    }
  });
});

describe("fee terms section rendering (fix plan 12.2)", () => {
  it("renders the total and every line with amounts and due dates", () => {
    const schedule = buildInstallmentSchedule({
      totalFeeCents: 1200000,
      retainerCents: 300000,
      installmentCount: 2,
      firstDueOn: "2026-09-15",
      frequency: "monthly",
    });
    if (!schedule.ok) throw new Error(schedule.error);
    const text = renderFeeTermsSection(1200000, schedule.lines);
    expect(text).toContain("ENGAGEMENT FEE & PAYMENT SCHEDULE");
    expect(text).toContain("Total engagement fee: $12,000.00");
    expect(text).toContain("1. Retainer (due at signing): $3,000.00");
    expect(text).toContain("2. Installment 1 of 2: $4,500.00 — due September 15, 2026");
    expect(text).toContain("3. Installment 2 of 2: $4,500.00 — due October 15, 2026");
  });
});

describe("signed agreement PDF", () => {
  it("renders a non-empty PDF for a signed agreement", async () => {
    const bytes = await renderSignedAgreementPdf({
      title: "Engagement Letter",
      firmName: "Acme Counseling",
      body: "Terms of engagement.\n\nSection 1. Services.\n" + "Long paragraph. ".repeat(200),
      documentHash: "a".repeat(64),
      signatures: [
        {
          role: "firm",
          signedName: "Jordan Ellis",
          signerEmail: "jordan@acme.test",
          signedAt: "Mon, 01 Jun 2026 12:00:00 GMT",
          ipAddress: "203.0.113.5",
        },
        {
          role: "family",
          signedName: "Alex Rivera",
          signerEmail: "alex@family.test",
          signedAt: "Tue, 02 Jun 2026 12:00:00 GMT",
          ipAddress: null,
        },
      ],
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // PDF magic bytes
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });
});
