import { describe, expect, it } from "vitest";
import {
  renderAgreementBody,
  nextAgreementStatus,
  templatePlaceholders,
  unsupportedPlaceholders,
  templateNeedsFeeTerms,
} from "@/lib/agreements/render";
import {
  inlinesToText,
  parseAgreementMarkdown,
  parseInlines,
} from "@/lib/agreements/markdown";
import {
  buildInstallmentSchedule,
  formatCents,
  parseDollarsToCents,
  renderFeeTermsSection,
} from "@/lib/agreements/schedule";
import { renderSignedAgreementPdf } from "@/lib/agreements/pdf";
import {
  isValidSigningToken,
  signingLinkPath,
  signingLinkUrl,
} from "@/lib/agreements/links";

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

describe("secure signing links (fix plan 12.7)", () => {
  const token = "a".repeat(48);

  it("accepts only 48 lowercase hex characters", () => {
    expect(isValidSigningToken(token)).toBe(true);
    expect(isValidSigningToken("0123456789abcdef".repeat(3))).toBe(true);
    expect(isValidSigningToken("A".repeat(48))).toBe(false);
    expect(isValidSigningToken("a".repeat(47))).toBe(false);
    expect(isValidSigningToken("a".repeat(49))).toBe(false);
    expect(isValidSigningToken("../" + "a".repeat(45))).toBe(false);
    expect(isValidSigningToken(null)).toBe(false);
    expect(isValidSigningToken(undefined)).toBe(false);
    expect(isValidSigningToken(42)).toBe(false);
  });

  it("builds the public path and an absolute URL from the app origin", () => {
    expect(signingLinkPath(token)).toBe(`/sign/${token}`);
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test/";
    try {
      expect(signingLinkUrl(token)).toBe(
        `https://app.example.test/sign/${token}`
      );
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = prev;
    }
  });
});

describe("template placeholders (12.7 follow-up)", () => {
  const body =
    "# {{firm_name}} × {{family_name}}\nDated {{date}}, {{ year }}.\n" +
    "Fee {{total_fee}}; deposit {{deposit_fee}}; until {{refundable_deadline}}.";

  it("lists every distinct placeholder and flags the unsupported ones", () => {
    expect(templatePlaceholders(body)).toEqual([
      "firm_name",
      "family_name",
      "date",
      "year",
      "total_fee",
      "deposit_fee",
      "refundable_deadline",
    ]);
    expect(unsupportedPlaceholders(body)).toEqual(["refundable_deadline"]);
    expect(unsupportedPlaceholders("plain {{firm_name}}")).toEqual([]);
  });

  it("knows when fee terms are required", () => {
    expect(templateNeedsFeeTerms(body)).toBe(true);
    expect(templateNeedsFeeTerms("{{firm_name}} and {{family_name}}")).toBe(false);
    expect(templateNeedsFeeTerms("deposit {{retainer}}")).toBe(true);
  });

  it("fills fee and year placeholders, derives year from the date, leaves unknowns verbatim", () => {
    const out = renderAgreementBody(
      "{{year}} {{total_fee}} {{deposit_fee}} {{retainer}} {{mystery}}",
      {
        family_name: "F",
        firm_name: "G",
        date: "September 5, 2026",
        total_fee: "$5,400.00",
        deposit_fee: "$2,700.00",
      }
    );
    expect(out).toBe("2026 $5,400.00 $2,700.00 $2,700.00 {{mystery}}");
    // Without fee terms the fee placeholders stay (send-time validation
    // refuses that case before it can be hashed).
    expect(
      renderAgreementBody("{{total_fee}}", { family_name: "F", firm_name: "G", date: "May 1, 2027" })
    ).toBe("{{total_fee}}");
  });
});

describe("agreement markdown", () => {
  it("parses headings, rules, bullets, numbered lists, and paragraphs", () => {
    const blocks = parseAgreementMarkdown(
      "# COLLEGE ADMISSIONS CONSULTING AGREEMENT\n\n**STATE OF FLORIDA**\n\n---\n\n" +
        "## 1. SCOPE\n\nConsultant agrees to:\n\n- Strategy;\n- List development.\n\n" +
        "1. Retainer: $3,000.00\n2. Installment 1 of 2: $4,500.00\n\n" +
        "----------------------------------------\nENGAGEMENT FEE\nSecond line"
    );
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "hr",
      "heading",
      "paragraph",
      "bullets",
      "ordered",
      "hr",
      "paragraph",
    ]);
    expect(blocks[0]).toMatchObject({ level: 1 });
    expect(blocks[3]).toMatchObject({ level: 2 });
    expect(blocks[5]).toMatchObject({ items: [[{ type: "text", text: "Strategy;" }], [{ type: "text", text: "List development." }]] });
    // Single newlines inside a paragraph are kept as separate lines.
    expect(blocks[8]).toMatchObject({ lines: [[{ type: "text", text: "ENGAGEMENT FEE" }], [{ type: "text", text: "Second line" }]] });
  });

  it("parses inline emphasis and drops the markers in plain text", () => {
    const inlines = parseInlines("**Macaroni Family** (\"Client\"), *not* bold, snake_case_word");
    expect(inlines).toEqual([
      { type: "bold", text: "Macaroni Family" },
      { type: "text", text: ' ("Client"), ' },
      { type: "italic", text: "not" },
      { type: "text", text: " bold, snake_case_word" },
    ]);
    expect(inlinesToText(inlines)).toBe('Macaroni Family ("Client"), not bold, snake_case_word');
  });

  it("never emits anything but text nodes (no raw HTML passthrough)", () => {
    const blocks = parseAgreementMarkdown('<script>alert(1)</script> [x](http://e.vil)');
    expect(blocks).toEqual([
      { type: "paragraph", lines: [[{ type: "text", text: '<script>alert(1)</script> [x](http://e.vil)' }]] },
    ]);
  });
});
