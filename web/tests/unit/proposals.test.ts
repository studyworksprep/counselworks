import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyDiscount,
  discountPercentFor,
  formatPercent,
  parsePercent,
  percentToBasisPoints,
  pricingProblem,
} from "@/lib/proposals/pricing";
import {
  MAX_CUSTOM_LINES,
  atSigningCents,
  buildProposalSchedule,
  defaultBalanceDueOn,
  isIsoDate,
  parseStoredSchedule,
  pastDueLines,
  scheduleTotalCents,
  toStoredSchedule,
  type ProposalScheduleInput,
} from "@/lib/proposals/schedule";
import {
  defaultTermsAndConditions,
  feeSummaryLines,
  renderAgreementProposalSection,
  renderProposalTerms,
  testPrepLines,
  type ProposalTermsSource,
} from "@/lib/proposals/terms";
import {
  approvalProblem,
  conversionProblem,
  isProposalExpired,
  proposalDisplayStatus,
  proposalEditable,
  withdrawProblem,
} from "@/lib/proposals/status";
import {
  graduationYearOptions,
  validateProposalInput,
  type ProposalInput,
} from "@/lib/proposals/input";
import {
  isValidProposalToken,
  proposalLinkPath,
  proposalLinkUrl,
} from "@/lib/proposals/links";
import { termsFingerprint } from "@/lib/proposals/fingerprint";
import {
  centsToInput,
  effectiveBalanceDueOn,
  effectiveDiscountedCents,
  effectiveTerms,
  newProposalFormValues,
  proposalFormValuesFromRow,
  proposalInputFromForm,
  type ProposalFormValues,
} from "@/lib/proposals/form";
import {
  normalizeProposalRow,
  toProposalView,
  toTermsSource,
  unwrapLinkedAgreement,
  type ProposalRow,
} from "@/lib/proposals/row";
import {
  PAYMENT_STRUCTURES,
  PROPOSAL_DISPLAY_LABELS,
  PROPOSAL_DISPLAY_STATUSES,
  PROPOSAL_STATUSES,
} from "@/lib/constants/proposals";
import { INSTALLMENT_FREQUENCY_VALUES } from "@/lib/constants/billing";
import { renderFeeTermsSection } from "@/lib/agreements/schedule";
import {
  inlinesToText,
  parseAgreementMarkdown,
} from "@/lib/agreements/markdown";
import { renderSignedAgreementPdf } from "@/lib/agreements/pdf";
import { proposalAccessAllowed } from "@/lib/auth/authorize";

// The email templates send through Resend; capture what they would send.
const sentEmails: Array<{
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}> = [];
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (payload: (typeof sentEmails)[number]) => {
        sentEmails.push(payload);
        return { error: null };
      },
    };
  },
}));

const TODAY = "2026-11-12";

describe("proposal pricing", () => {
  it("applies a percent discount to the cent", () => {
    expect(applyDiscount(1200000, 10)).toBe(1080000);
    expect(applyDiscount(1200000, 0)).toBe(1200000);
    expect(applyDiscount(1150000, 12.5)).toBe(1006250);
    // A third of a cent rounds to the nearest cent, never truncates.
    expect(applyDiscount(999999, 33.33)).toBe(666699);
  });

  it("derives the percent a discounted price represents, to two decimals", () => {
    expect(discountPercentFor(1200000, 1080000)).toBe(10);
    expect(discountPercentFor(1150000, 1000000)).toBe(13.04);
    expect(discountPercentFor(1200000, 1200000)).toBe(0);
  });

  it("parses what a counselor types and rejects junk", () => {
    expect(parsePercent("10")).toBe(10);
    expect(parsePercent("12.5%")).toBe(12.5);
    expect(parsePercent("")).toBe(0);
    expect(parsePercent("100")).toBeNull();
    expect(parsePercent("12.555")).toBeNull();
    expect(parsePercent("-5")).toBeNull();
    expect(parsePercent("ten")).toBeNull();
  });

  it("formats percents without trailing zeros", () => {
    expect(formatPercent(10)).toBe("10%");
    expect(formatPercent(12.5)).toBe("12.5%");
    expect(formatPercent(13.04)).toBe("13.04%");
  });

  it("converts percents to basis points and refuses finer precision", () => {
    expect(percentToBasisPoints(12.5)).toBe(1250);
    expect(percentToBasisPoints(13.04)).toBe(1304);
    expect(percentToBasisPoints(12.345)).toBeNull();
    expect(percentToBasisPoints(100)).toBeNull();
    expect(percentToBasisPoints(-1)).toBeNull();
  });

  it("accepts a triple that agrees in either direction", () => {
    // Percent typed → cost follows.
    expect(
      pricingProblem({ totalCents: 1200000, discountPercent: 10, discountedCents: 1080000 })
    ).toBeNull();
    // Round discounted cost typed → percent follows (13.04% of $11,500 is
    // $1,499.60, so the percent alone would NOT reproduce $10,000).
    expect(applyDiscount(1150000, 13.04)).not.toBe(1000000);
    expect(
      pricingProblem({ totalCents: 1150000, discountPercent: 13.04, discountedCents: 1000000 })
    ).toBeNull();
    // No discount.
    expect(
      pricingProblem({ totalCents: 500000, discountPercent: 0, discountedCents: 500000 })
    ).toBeNull();
  });

  it("refuses a price that contradicts its own discount label", () => {
    expect(
      pricingProblem({ totalCents: 1200000, discountPercent: 10, discountedCents: 900000 })
    ).toMatch(/don't match/);
    expect(
      pricingProblem({ totalCents: 1200000, discountPercent: 0, discountedCents: 1100000 })
    ).toMatch(/don't match/);
  });

  it("refuses impossible amounts", () => {
    expect(
      pricingProblem({ totalCents: 0, discountPercent: 0, discountedCents: 0 })
    ).toMatch(/total cost/);
    expect(
      pricingProblem({ totalCents: 1000, discountPercent: 0, discountedCents: 2000 })
    ).toMatch(/cannot be more/);
    expect(
      pricingProblem({ totalCents: 1000, discountPercent: 100, discountedCents: 0 })
    ).toMatch(/between 0 and 99.99/);
    expect(
      pricingProblem({ totalCents: 1000, discountPercent: 99.99, discountedCents: 0 })
    ).toMatch(/more than \$0/);
  });
});

describe("proposal payment schedules", () => {
  const base: ProposalScheduleInput = {
    structure: "half_half",
    totalCents: 1080000,
    depositCents: null,
    installmentCount: null,
    firstDueOn: "2028-01-01",
    customLines: [],
  };

  it("half/half: half at signing, half at the final application or the set date", () => {
    const result = buildProposalSchedule(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toEqual([
      {
        installmentNumber: 1,
        label: "First half (due at signing)",
        amountCents: 540000,
        isRetainer: true,
        dueOn: null,
      },
      {
        installmentNumber: 2,
        label:
          "Second half (when the final application is submitted or January 1, 2028, whichever comes first)",
        amountCents: 540000,
        isRetainer: false,
        dueOn: "2028-01-01",
      },
    ]);
  });

  it("half/half: an odd cent goes to the first half and the halves sum exactly", () => {
    const result = buildProposalSchedule({ ...base, totalCents: 1000001 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines.map((l) => l.amountCents)).toEqual([500001, 500000]);
    expect(scheduleTotalCents(result.lines)).toBe(1000001);
  });

  it("half/half: needs the due-by date", () => {
    const result = buildProposalSchedule({ ...base, firstDueOn: null });
    expect(result).toEqual({
      ok: false,
      error: "Choose the date the second half is due by",
    });
  });

  it("defaults the half/half date to January 1 of senior year, else the next January 1", () => {
    expect(defaultBalanceDueOn(2028, TODAY)).toBe("2028-01-01");
    expect(defaultBalanceDueOn(2027, TODAY)).toBe("2027-01-01");
    // Already past (a current senior signing in the spring).
    expect(defaultBalanceDueOn(2026, TODAY)).toBe("2027-01-01");
    expect(defaultBalanceDueOn(2027, "2027-01-01")).toBe("2028-01-01");
  });

  it("deposit + monthly: deposit at signing, then even monthly payments", () => {
    const result = buildProposalSchedule({
      ...base,
      structure: "deposit_monthly",
      depositCents: 200000,
      installmentCount: 8,
      firstDueOn: "2026-12-15",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toHaveLength(9);
    expect(result.lines[0]).toEqual({
      installmentNumber: 1,
      label: "Deposit (due at signing)",
      amountCents: 200000,
      isRetainer: true,
      dueOn: null,
    });
    expect(result.lines[1]).toMatchObject({
      label: "Monthly payment 1 of 8",
      amountCents: 110000,
      dueOn: "2026-12-15",
    });
    expect(result.lines[8]).toMatchObject({
      label: "Monthly payment 8 of 8",
      dueOn: "2027-07-15",
    });
    expect(scheduleTotalCents(result.lines)).toBe(1080000);
    expect(atSigningCents(result.lines)).toBe(200000);
  });

  it("deposit + quarterly: steps three months and absorbs cent rounding", () => {
    const result = buildProposalSchedule({
      ...base,
      structure: "deposit_quarterly",
      totalCents: 1000000,
      depositCents: 100000,
      installmentCount: 7,
      firstDueOn: "2027-01-31",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines[1]).toMatchObject({
      label: "Quarterly payment 1 of 7",
      dueOn: "2027-01-31",
    });
    expect(result.lines[2].dueOn).toBe("2027-04-30");
    // $9,000 over 7 doesn't divide evenly; the lines still sum to the cent.
    expect(scheduleTotalCents(result.lines)).toBe(1000000);
  });

  it("deposit structures refuse a missing or oversized deposit, count, or date", () => {
    const monthly = { ...base, structure: "deposit_monthly" as const };
    expect(
      buildProposalSchedule({ ...monthly, installmentCount: 4, firstDueOn: "2027-01-01" })
    ).toEqual({ ok: false, error: "Enter the deposit amount" });
    expect(
      buildProposalSchedule({
        ...monthly,
        depositCents: 1080000,
        installmentCount: 4,
        firstDueOn: "2027-01-01",
      })
    ).toMatchObject({ ok: false, error: expect.stringMatching(/less than the cost/) });
    expect(
      buildProposalSchedule({ ...monthly, depositCents: 100000, firstDueOn: "2027-01-01" })
    ).toEqual({ ok: false, error: "Choose how many payments follow the deposit" });
    expect(
      buildProposalSchedule({
        ...monthly,
        depositCents: 100000,
        installmentCount: 4,
        firstDueOn: null,
      })
    ).toEqual({ ok: false, error: "Choose the first payment date" });
    expect(
      buildProposalSchedule({
        ...monthly,
        depositCents: 100000,
        installmentCount: 99,
        firstDueOn: "2027-01-01",
      })
    ).toMatchObject({ ok: false, error: expect.stringMatching(/At most 36/) });
  });

  it("custom: keeps the counselor's lines and marks an undated first line due at signing", () => {
    const result = buildProposalSchedule({
      ...base,
      structure: "custom",
      firstDueOn: null,
      customLines: [
        { label: "Enrollment fee", amountCents: 80000, dueOn: null },
        { label: "Junior-year planning", amountCents: 500000, dueOn: "2027-02-01" },
        { label: "Application season", amountCents: 500000, dueOn: "2027-08-01" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines.map((l) => [l.label, l.isRetainer, l.dueOn])).toEqual([
      ["Enrollment fee (due at signing)", true, null],
      ["Junior-year planning", false, "2027-02-01"],
      ["Application season", false, "2027-08-01"],
    ]);
  });

  it("custom: every payment may be dated (nothing due at signing)", () => {
    const result = buildProposalSchedule({
      ...base,
      structure: "custom",
      totalCents: 300000,
      customLines: [
        { label: "First", amountCents: 100000, dueOn: "2027-01-01" },
        { label: "Second", amountCents: 200000, dueOn: "2027-01-01" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(atSigningCents(result.lines)).toBe(0);
    expect(result.lines.every((l) => !l.isRetainer)).toBe(true);
  });

  it("custom: the lines must add up to the cost, and says by how much they miss", () => {
    const short = buildProposalSchedule({
      ...base,
      structure: "custom",
      customLines: [{ label: "Only payment", amountCents: 1000000, dueOn: null }],
    });
    expect(short).toEqual({
      ok: false,
      error:
        "The payments add up to $10,000.00 — $800.00 less than the $10,800.00 cost",
    });
    const over = buildProposalSchedule({
      ...base,
      structure: "custom",
      customLines: [{ label: "Only payment", amountCents: 1100000, dueOn: null }],
    });
    expect(over).toMatchObject({
      ok: false,
      error: expect.stringMatching(/\$200\.00 more than/),
    });
  });

  it("custom: refuses blank, undated, misordered, and excessive lines", () => {
    const custom = { ...base, structure: "custom" as const, totalCents: 200 };
    expect(buildProposalSchedule({ ...custom, customLines: [] })).toEqual({
      ok: false,
      error: "Add at least one payment",
    });
    expect(
      buildProposalSchedule({
        ...custom,
        customLines: [{ label: "  ", amountCents: 200, dueOn: null }],
      })
    ).toEqual({ ok: false, error: "Payment 1 needs a description" });
    expect(
      buildProposalSchedule({
        ...custom,
        customLines: [{ label: "A", amountCents: 0, dueOn: null }],
      })
    ).toEqual({ ok: false, error: "Payment 1 needs an amount" });
    expect(
      buildProposalSchedule({
        ...custom,
        customLines: [
          { label: "A", amountCents: 100, dueOn: null },
          { label: "B", amountCents: 100, dueOn: null },
        ],
      })
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/only the first payment can be due at signing/),
    });
    expect(
      buildProposalSchedule({
        ...custom,
        customLines: [
          { label: "A", amountCents: 100, dueOn: "2027-06-01" },
          { label: "B", amountCents: 100, dueOn: "2027-05-01" },
        ],
      })
    ).toMatchObject({ ok: false, error: expect.stringMatching(/date order/) });
    expect(
      buildProposalSchedule({
        ...custom,
        customLines: [{ label: "A", amountCents: 200, dueOn: "2027-02-31" }],
      })
    ).toEqual({ ok: false, error: "Payment 1 needs a valid due date" });
    expect(
      buildProposalSchedule({
        ...custom,
        customLines: Array.from({ length: MAX_CUSTOM_LINES + 1 }, () => ({
          label: "A",
          amountCents: 1,
          dueOn: "2027-01-01",
        })),
      })
    ).toMatchObject({ ok: false, error: expect.stringMatching(/At most 37/) });
  });

  it("validates real calendar dates", () => {
    expect(isIsoDate("2026-12-31")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("12/31/2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("round-trips through the stored JSON shape and rejects malformed JSON", () => {
    const built = buildProposalSchedule(base);
    if (!built.ok) throw new Error(built.error);
    const stored = toStoredSchedule(built.lines);
    expect(stored[0]).toEqual({
      installment_number: 1,
      label: "First half (due at signing)",
      amount_cents: 540000,
      is_retainer: true,
      due_on: null,
    });
    expect(parseStoredSchedule(stored)).toEqual(built.lines);
    // Survives a JSON round trip (what Postgres jsonb hands back).
    expect(parseStoredSchedule(JSON.parse(JSON.stringify(stored)))).toEqual(
      built.lines
    );

    expect(parseStoredSchedule(null)).toBeNull();
    expect(parseStoredSchedule([])).toBeNull();
    expect(parseStoredSchedule([{ label: "x", amount_cents: -1 }])).toBeNull();
    // A dated-less line that isn't the at-signing payment can't be invoiced.
    expect(
      parseStoredSchedule([
        { label: "x", amount_cents: 100, is_retainer: false, due_on: null },
      ])
    ).toBeNull();
  });

  it("flags dated payments that are already past", () => {
    const built = buildProposalSchedule({ ...base, firstDueOn: "2026-10-01" });
    if (!built.ok) throw new Error(built.error);
    expect(pastDueLines(built.lines, TODAY).map((l) => l.installmentNumber)).toEqual([2]);
    expect(pastDueLines(built.lines, "2026-09-30")).toEqual([]);
  });

  it("maps deposit structures onto the billing cadence values, never a new spelling", () => {
    for (const structure of PAYMENT_STRUCTURES) {
      if (structure.frequency !== null) {
        expect(INSTALLMENT_FREQUENCY_VALUES.has(structure.frequency)).toBe(true);
      }
    }
  });
});

const termsSource: ProposalTermsSource = {
  title: "Comprehensive College Counseling",
  parentName: "Pat Rivera",
  studentName: "Sam Rivera",
  graduationYear: 2028,
  servicesSummary: "- College list\n- Essay coaching",
  totalCostCents: 1200000,
  discountPercent: 10,
  discountedCostCents: 1080000,
  lines: [
    {
      installmentNumber: 1,
      label: "Deposit (due at signing)",
      amountCents: 200000,
      isRetainer: true,
      dueOn: null,
    },
    {
      installmentNumber: 2,
      label: "Monthly payment 1 of 1",
      amountCents: 880000,
      isRetainer: false,
      dueOn: "2027-01-15",
    },
  ],
  testPrepLessons: 10,
  additionalSessionRateCents: 15000,
  termsAndConditions: "1. **No guarantee of admission.** None is promised.",
  validUntil: "2026-12-12",
};

describe("proposal terms text", () => {
  it("renders every term a client approves", () => {
    const text = renderProposalTerms(termsSource);
    expect(text).toContain("## Comprehensive College Counseling");
    expect(text).toContain(
      "Prepared for Pat Rivera. Student: Sam Rivera, Class of 2028."
    );
    expect(text).toContain("- Program fee: $12,000.00");
    expect(text).toContain("- Discount (10%): -$1,200.00");
    expect(text).toContain("- Total after discount: $10,800.00");
    expect(text).toContain("1. Deposit (due at signing): $2,000.00");
    expect(text).toContain(
      "2. Monthly payment 1 of 1: $8,800.00 — due January 15, 2027"
    );
    expect(text).toContain(
      "- 10 test preparation lessons are included at no additional charge."
    );
    expect(text).toContain(
      "- Additional sessions after the included lessons are used: $150.00 per session."
    );
    expect(text).toContain("### Terms and conditions");
    expect(text).toContain("This proposal is valid through December 12, 2026.");
  });

  it("omits what the proposal doesn't have", () => {
    const text = renderProposalTerms({
      ...termsSource,
      discountPercent: 0,
      discountedCostCents: 1200000,
      testPrepLessons: null,
      additionalSessionRateCents: null,
      termsAndConditions: null,
    });
    expect(text).toContain("- Total: $12,000.00");
    expect(text).not.toContain("Discount");
    expect(text).not.toContain("Test preparation");
    expect(text).not.toContain("Terms and conditions");
  });

  it("words a single lesson and a pack without an extra-session price", () => {
    expect(testPrepLines({ testPrepLessons: 1, additionalSessionRateCents: null })).toEqual([
      "1 test preparation lesson is included at no additional charge.",
    ]);
    expect(testPrepLines({ testPrepLessons: null, additionalSessionRateCents: null })).toEqual(
      []
    );
  });

  it("summarizes fees with and without a discount", () => {
    expect(feeSummaryLines(termsSource)).toHaveLength(3);
    expect(
      feeSummaryLines({ totalCostCents: 500000, discountPercent: 0, discountedCostCents: 500000 })
    ).toEqual(["Total: $5,000.00"]);
  });

  it("the fingerprint changes with any term and ignores nothing a client reads", () => {
    const original = termsFingerprint(renderProposalTerms(termsSource));
    expect(original).toMatch(/^[a-f0-9]{64}$/);
    expect(termsFingerprint(renderProposalTerms({ ...termsSource }))).toBe(original);
    const variants: Partial<ProposalTermsSource>[] = [
      { discountedCostCents: 1070000 },
      { additionalSessionRateCents: 20000 },
      { testPrepLessons: 12 },
      { termsAndConditions: "1. Changed." },
      { validUntil: "2026-12-31" },
      { servicesSummary: "- Something else" },
      { lines: [{ ...termsSource.lines[0], amountCents: 1080000 }] },
    ];
    for (const change of variants) {
      expect(
        termsFingerprint(renderProposalTerms({ ...termsSource, ...change })),
        JSON.stringify(change)
      ).not.toBe(original);
    }
  });

  it("default terms add the test-prep clause only when lessons are included, numbered in order", () => {
    const without = defaultTermsAndConditions({ includesTestPrep: false });
    const withPrep = defaultTermsAndConditions({ includesTestPrep: true });
    expect(without).not.toContain("Test preparation lessons");
    expect(withPrep).toContain("**Test preparation lessons.**");
    expect(without).toContain("**No guarantee of admission.**");
    const numbers = (text: string) =>
      text.split("\n").map((line) => Number(line.split(".")[0]));
    expect(numbers(without)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(numbers(withPrep)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("the agreement section embeds the accepted terms without repeating the schedule", () => {
    const section = renderAgreementProposalSection(termsSource, {
      approvedByName: "Pat Rivera",
      approvedOn: "2026-11-20",
    });
    expect(section).toContain(
      "The following proposal was accepted by Pat Rivera on November 20, 2026 and forms part of this agreement."
    );
    expect(section).toContain("## Accepted proposal: Comprehensive College Counseling");
    expect(section).toContain("- Total after discount: $10,800.00");
    expect(section).toContain("### Test preparation");
    // The agreement's own fee section carries the schedule, once.
    expect(section).not.toContain("### Payment schedule");
    expect(section).not.toContain("Monthly payment 1 of 1");

    const body =
      "This agreement covers counseling." +
      section +
      renderFeeTermsSection(termsSource.discountedCostCents, termsSource.lines);
    expect(body.match(/Monthly payment 1 of 1/g)).toHaveLength(1);
  });

  it("renders as the agreement markdown subset: headings, bullets, numbered terms", () => {
    const blocks = parseAgreementMarkdown(
      renderAgreementProposalSection(
        { ...termsSource, termsAndConditions: defaultTermsAndConditions({ includesTestPrep: true }) },
        { approvedByName: "Pat Rivera", approvedOn: "2026-11-20" }
      )
    );
    expect(blocks[0]).toEqual({ type: "hr" });
    const headings = blocks
      .filter((b) => b.type === "heading")
      .map((b) => (b.type === "heading" ? inlinesToText(b.inlines) : ""));
    expect(headings).toEqual([
      "Accepted proposal: Comprehensive College Counseling",
      "Services",
      "Fees",
      "Test preparation",
      "Terms and conditions",
    ]);
    const ordered = blocks.find((b) => b.type === "ordered");
    expect(ordered?.type === "ordered" && ordered.items).toHaveLength(10);
  });

  it("the embedded section and default terms survive the signed-agreement PDF", async () => {
    // The PDF's standard fonts only draw WinAnsi characters; generated
    // proposal wording must never be what breaks agreement execution.
    const body =
      "Agreement text." +
      renderAgreementProposalSection(
        {
          ...termsSource,
          termsAndConditions: defaultTermsAndConditions({ includesTestPrep: true }),
        },
        { approvedByName: "Pat Rivera", approvedOn: "2026-11-20" }
      ) +
      renderFeeTermsSection(termsSource.discountedCostCents, termsSource.lines);
    const pdf = await renderSignedAgreementPdf({
      title: "Engagement Letter",
      firmName: "Acme Counseling",
      body,
      documentHash: "0".repeat(64),
      signatures: [],
    });
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});

describe("proposal lifecycle", () => {
  const sent = { status: "sent", valid_until: "2026-12-12" };

  it("expires a sent proposal the day after its valid-through date", () => {
    expect(isProposalExpired(sent, "2026-12-12")).toBe(false);
    expect(isProposalExpired(sent, "2026-12-13")).toBe(true);
    // Only "sent" expires: drafts aren't out yet, approvals are final.
    expect(isProposalExpired({ ...sent, status: "draft" }, "2027-01-01")).toBe(false);
    expect(isProposalExpired({ ...sent, status: "approved" }, "2027-01-01")).toBe(false);
  });

  it("derives the display status from expiry and the linked agreement", () => {
    expect(proposalDisplayStatus({ ...sent, status: "draft" }, TODAY)).toBe("draft");
    expect(proposalDisplayStatus(sent, TODAY)).toBe("sent");
    expect(proposalDisplayStatus(sent, "2027-01-01")).toBe("expired");
    const approved = { ...sent, status: "approved" };
    expect(proposalDisplayStatus(approved, TODAY)).toBe("approved");
    expect(proposalDisplayStatus({ ...approved, agreement_status: "sent" }, TODAY)).toBe(
      "agreement_sent"
    );
    expect(
      proposalDisplayStatus({ ...approved, agreement_status: "partially_signed" }, TODAY)
    ).toBe("agreement_sent");
    expect(
      proposalDisplayStatus({ ...approved, agreement_status: "completed" }, TODAY)
    ).toBe("agreement_completed");
    // A voided agreement no longer counts: approved again, convertible again.
    expect(proposalDisplayStatus({ ...approved, agreement_status: "voided" }, TODAY)).toBe(
      "approved"
    );
    expect(proposalDisplayStatus({ ...sent, status: "withdrawn" }, TODAY)).toBe("withdrawn");
  });

  it("every display status has a label", () => {
    for (const s of PROPOSAL_DISPLAY_STATUSES) {
      expect(PROPOSAL_DISPLAY_LABELS[s.value]).toBeTruthy();
    }
    // Every stored status is also a display status (no unlabeled value).
    for (const stored of PROPOSAL_STATUSES) {
      expect(PROPOSAL_DISPLAY_LABELS[stored]).toBeTruthy();
    }
  });

  it("freezes terms once approved", () => {
    expect(proposalEditable("draft")).toBe(true);
    expect(proposalEditable("sent")).toBe(true);
    expect(proposalEditable("approved")).toBe(false);
    expect(proposalEditable("withdrawn")).toBe(false);
  });

  it("lets the client approve only a live, unexpired proposal", () => {
    expect(approvalProblem(sent, TODAY)).toBeNull();
    expect(approvalProblem(sent, "2026-12-13")).toMatch(/expired/);
    expect(approvalProblem({ ...sent, status: "approved" }, TODAY)).toMatch(/already/);
    expect(approvalProblem({ ...sent, status: "draft" }, TODAY)).toMatch(/no longer/);
    expect(approvalProblem({ ...sent, status: "withdrawn" }, TODAY)).toMatch(/no longer/);
  });

  it("creates an agreement only from an approved proposal without a live one", () => {
    expect(conversionProblem({ status: "approved" })).toBeNull();
    expect(conversionProblem({ status: "approved", agreement_status: "voided" })).toBeNull();
    expect(conversionProblem({ status: "sent" })).toMatch(/approved/);
    expect(conversionProblem({ status: "approved", agreement_status: "sent" })).toMatch(
      /already been created/
    );
  });

  it("withdraws sent or approved proposals, but not once an agreement is out", () => {
    expect(withdrawProblem({ status: "sent" })).toBeNull();
    expect(withdrawProblem({ status: "approved" })).toBeNull();
    expect(withdrawProblem({ status: "draft" })).toMatch(/sent, approved, or rejected/);
    expect(withdrawProblem({ status: "rejected" })).toBeNull();
    expect(proposalEditable("rejected")).toBe(false);
    expect(approvalProblem({ status: "rejected", valid_until: "2027-01-01" }, TODAY)).toMatch(/rejected/);
    expect(conversionProblem({ status: "rejected" })).toMatch(/Only an approved/);
    expect(withdrawProblem({ status: "approved", agreement_status: "sent" })).toMatch(
      /void the agreement/
    );
    expect(withdrawProblem({ status: "approved", agreement_status: "voided" })).toBeNull();
  });
});

describe("proposal input validation", () => {
  const valid: ProposalInput = {
    parentFirstName: " Pat ",
    parentLastName: "Rivera",
    parentEmail: " Pat.Rivera@Example.com ",
    studentFirstName: "Sam",
    studentLastName: "Rivera",
    graduationYear: 2028,
    title: "Comprehensive College Counseling",
    introMessage: "  ",
    servicesSummary: "- College list",
    totalCostCents: 1200000,
    discountPercent: 10,
    discountedCostCents: 1080000,
    paymentStructure: "half_half",
    depositCents: null,
    installmentCount: null,
    firstDueOn: "2028-01-01",
    customLines: [],
    testPrepLessons: 10,
    additionalSessionRateCents: 15000,
    termsAndConditions: "1. Terms.",
    validUntil: "2026-12-12",
  };

  it("normalizes text and resolves the schedule from the discounted cost", () => {
    const result = validateProposalInput(valid, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parentFirstName).toBe("Pat");
    expect(result.value.parentEmail).toBe("pat.rivera@example.com");
    // Blank optional text is NULL, not "".
    expect(result.value.introMessage).toBeNull();
    expect(result.value.lines.map((l) => l.amountCents)).toEqual([540000, 540000]);
  });

  it("drops inputs that belong to a different payment structure", () => {
    const result = validateProposalInput(
      {
        ...valid,
        // Left over from a structure the counselor switched away from.
        depositCents: 200000,
        installmentCount: 6,
        customLines: [{ label: "Stale", amountCents: 1, dueOn: null }],
      },
      TODAY
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.depositCents).toBeNull();
    expect(result.value.installmentCount).toBeNull();
    expect(result.value.customLines).toEqual([]);

    const custom = validateProposalInput(
      {
        ...valid,
        paymentStructure: "custom",
        customLines: [{ label: "All at once", amountCents: 1080000, dueOn: null }],
      },
      TODAY
    );
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;
    expect(custom.value.firstDueOn).toBeNull();
  });

  it("reports the first problem in plain language", () => {
    const errorFor = (patch: Partial<ProposalInput>) => {
      const result = validateProposalInput({ ...valid, ...patch }, TODAY);
      return result.ok ? null : result.error;
    };
    expect(errorFor({ parentFirstName: "" })).toBe("Parent first name is required");
    expect(errorFor({ parentEmail: "not-an-email" })).toBe("Enter a valid parent email");
    expect(errorFor({ title: " " })).toBe("Give the proposal a title");
    expect(errorFor({ servicesSummary: "" })).toMatch(/Describe the services/);
    expect(errorFor({ graduationYear: 2019 })).toBe("Choose the student's graduation year");
    expect(errorFor({ graduationYear: 2060 })).toBe("Choose the student's graduation year");
    expect(errorFor({ discountedCostCents: 900000 })).toMatch(/don't match/);
    expect(errorFor({ validUntil: "2026-11-11" })).toMatch(/already passed/);
    expect(errorFor({ validUntil: "soon" })).toBe("Enter a valid date");
    expect(errorFor({ firstDueOn: null })).toMatch(/second half is due by/);
    expect(errorFor({ firstDueOn: "2026-11-01" })).toBe(
      "A payment date has already passed (November 1, 2026) — choose a later date"
    );
    expect(errorFor({ testPrepLessons: 0 })).toMatch(/how many lessons/);
    expect(errorFor({ testPrepLessons: null })).toMatch(/after an included lesson pack/);
    expect(
      errorFor({ paymentStructure: "weekly" as ProposalInput["paymentStructure"] })
    ).toBe("Choose a payment structure");
  });

  it("allows test prep without an extra-session price, and no test prep at all", () => {
    expect(
      validateProposalInput({ ...valid, additionalSessionRateCents: null }, TODAY).ok
    ).toBe(true);
    expect(
      validateProposalInput(
        { ...valid, testPrepLessons: null, additionalSessionRateCents: null },
        TODAY
      ).ok
    ).toBe(true);
  });

  it("offers class years from this year forward", () => {
    expect(graduationYearOptions(TODAY)).toEqual([
      2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034,
    ]);
  });
});

describe("public proposal links", () => {
  const token = "ab12".repeat(12);

  it("accepts only 48 lowercase hex characters", () => {
    expect(isValidProposalToken(token)).toBe(true);
    expect(isValidProposalToken(token.toUpperCase())).toBe(false);
    expect(isValidProposalToken(token.slice(1))).toBe(false);
    expect(isValidProposalToken(undefined)).toBe(false);
  });

  it("builds the public path and an absolute URL from the app origin", () => {
    expect(proposalLinkPath(token)).toBe(`/proposal/${token}`);
    expect(proposalLinkUrl(token)).toMatch(
      new RegExp(`^https?://[^/]+/proposal/${token}$`)
    );
  });
});

describe("proposalAccessAllowed", () => {
  /**
   * Proposals hold a prospect's contact details and negotiated pricing.
   * Changing a `false` here to `true` is a security decision.
   */
  it("owners and admins reach every proposal in the firm", () => {
    for (const role of ["firm_owner", "firm_admin"]) {
      expect(proposalAccessAllowed({ role, isAuthor: false }), role).toBe(true);
      expect(proposalAccessAllowed({ role, isAuthor: true }), role).toBe(true);
    }
  });

  it("counselors reach only the proposals they wrote", () => {
    expect(proposalAccessAllowed({ role: "counselor", isAuthor: true })).toBe(true);
    expect(proposalAccessAllowed({ role: "counselor", isAuthor: false })).toBe(false);
  });

  it("staff without client management never reach proposals, even firm-wide readers", () => {
    for (const role of ["essay_coach", "tutor", "read_only_staff"]) {
      expect(proposalAccessAllowed({ role, isAuthor: false }), role).toBe(false);
      expect(proposalAccessAllowed({ role, isAuthor: true }), role).toBe(false);
    }
  });

  it("portal roles never reach proposals", () => {
    for (const role of ["student", "parent_guardian", "unknown"]) {
      expect(proposalAccessAllowed({ role, isAuthor: true }), role).toBe(false);
    }
  });
});

/** A stored proposal row, as PostgREST returns it. */
function storedRow(overrides: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    firm_id: "a0000000-0000-4000-8000-000000000001",
    status: "sent",
    parent_first_name: "Pat",
    parent_last_name: "Rivera",
    parent_email: "pat.rivera@example.com",
    student_first_name: "Sam",
    student_last_name: "Rivera",
    graduation_year: 2028,
    title: "Comprehensive College Counseling",
    intro_message: "Great to meet you both.",
    services_summary: "- College list\n- Essay coaching",
    total_cost_cents: 1200000,
    discount_percent: 10,
    discounted_cost_cents: 1080000,
    payment_structure: "deposit_monthly",
    deposit_cents: 200000,
    installment_count: 4,
    first_due_on: "2027-03-15",
    payment_schedule_json: [
      { installment_number: 1, label: "Deposit (due at signing)", amount_cents: 200000, is_retainer: true, due_on: null },
      { installment_number: 2, label: "Monthly payment 1 of 4", amount_cents: 220000, is_retainer: false, due_on: "2027-03-15" },
      { installment_number: 3, label: "Monthly payment 2 of 4", amount_cents: 220000, is_retainer: false, due_on: "2027-04-15" },
      { installment_number: 4, label: "Monthly payment 3 of 4", amount_cents: 220000, is_retainer: false, due_on: "2027-05-15" },
      { installment_number: 5, label: "Monthly payment 4 of 4", amount_cents: 220000, is_retainer: false, due_on: "2027-06-15" },
    ],
    test_prep_lessons: 10,
    additional_session_rate_cents: 15000,
    terms_and_conditions: "1. **Our own terms.** As agreed.",
    valid_until: "2026-12-12",
    public_token: "ab12".repeat(12),
    sent_at: "2026-11-12T15:00:00.000000+00:00",
    approved_at: null,
    approved_by_name: null,
    approved_via: null,
    rejected_at: null,
    rejection_comment: null,
    withdrawn_at: null,
    family_id: null,
    agreement_id: null,
    created_by_user_id: "a0000000-0000-4000-8000-000000000012",
    created_at: "2026-11-12T14:00:00.000000+00:00",
    updated_at: "2026-11-12T15:00:00.000000+00:00",
    ...overrides,
  };
}

/** Save what the edit form holds, untouched, and return what would be stored. */
function resave(row: ProposalRow) {
  const converted = proposalInputFromForm(proposalFormValuesFromRow(row), TODAY);
  if (!converted.ok) throw new Error(converted.error);
  const validated = validateProposalInput(converted.input, TODAY);
  if (!validated.ok) throw new Error(validated.error);
  return validated.value;
}

describe("proposal edit form (CLAUDE.md DoD rule 6: defaults every field)", () => {
  it("an untouched edit of a deposit + monthly proposal stores exactly what was there", () => {
    const row = storedRow();
    const saved = resave(row);
    expect(saved).toMatchObject({
      parentFirstName: row.parent_first_name,
      parentLastName: row.parent_last_name,
      parentEmail: row.parent_email,
      studentFirstName: row.student_first_name,
      studentLastName: row.student_last_name,
      graduationYear: row.graduation_year,
      title: row.title,
      introMessage: row.intro_message,
      servicesSummary: row.services_summary,
      totalCostCents: row.total_cost_cents,
      discountPercent: row.discount_percent,
      discountedCostCents: row.discounted_cost_cents,
      paymentStructure: row.payment_structure,
      depositCents: row.deposit_cents,
      installmentCount: row.installment_count,
      firstDueOn: row.first_due_on,
      testPrepLessons: row.test_prep_lessons,
      additionalSessionRateCents: row.additional_session_rate_cents,
      termsAndConditions: row.terms_and_conditions,
      validUntil: row.valid_until,
    });
    expect(toStoredSchedule(saved.lines)).toEqual(row.payment_schedule_json);
  });

  it("round-trips half/half, including a typed (non-default) due-by date", () => {
    const row = storedRow({
      payment_structure: "half_half",
      deposit_cents: null,
      installment_count: null,
      first_due_on: "2027-09-01",
      payment_schedule_json: [
        { installment_number: 1, label: "First half (due at signing)", amount_cents: 540000, is_retainer: true, due_on: null },
        {
          installment_number: 2,
          label:
            "Second half (when the final application is submitted or September 1, 2027, whichever comes first)",
          amount_cents: 540000,
          is_retainer: false,
          due_on: "2027-09-01",
        },
      ],
    });
    const saved = resave(row);
    expect(saved.firstDueOn).toBe("2027-09-01");
    expect(saved.depositCents).toBeNull();
    expect(toStoredSchedule(saved.lines)).toEqual(row.payment_schedule_json);
  });

  it("round-trips a custom schedule without growing its labels", () => {
    const row = storedRow({
      payment_structure: "custom",
      deposit_cents: null,
      installment_count: null,
      first_due_on: null,
      payment_schedule_json: [
        // Stored with the suffix the builder adds to an at-signing line.
        { installment_number: 1, label: "Enrollment fee (due at signing)", amount_cents: 80000, is_retainer: true, due_on: null },
        { installment_number: 2, label: "Application season", amount_cents: 1000000, is_retainer: false, due_on: "2027-08-01" },
      ],
    });
    const values = proposalFormValuesFromRow(row);
    expect(values.customLines.map((l) => [l.label, l.amount, l.atSigning, l.dueOn])).toEqual([
      ["Enrollment fee (due at signing)", "800", true, ""],
      ["Application season", "10,000", false, "2027-08-01"],
    ]);
    // Saving twice must not append the suffix twice.
    expect(toStoredSchedule(resave(row).lines)).toEqual(row.payment_schedule_json);
  });

  it("round-trips a price set by typing a round discounted cost, and no discount at all", () => {
    const derived = resave(
      storedRow({
        total_cost_cents: 1150000,
        discount_percent: 13.04,
        discounted_cost_cents: 1000000,
        payment_structure: "custom",
        deposit_cents: null,
        installment_count: null,
        first_due_on: null,
        payment_schedule_json: [
          { installment_number: 1, label: "In full (due at signing)", amount_cents: 1000000, is_retainer: true, due_on: null },
        ],
      })
    );
    expect(derived.discountPercent).toBe(13.04);
    expect(derived.discountedCostCents).toBe(1000000);

    const full = storedRow({ discount_percent: 0, discounted_cost_cents: 1200000, deposit_cents: 200000 });
    expect(proposalFormValuesFromRow(full).discountPercent).toBe("");
    const converted = proposalInputFromForm(proposalFormValuesFromRow(full), TODAY);
    expect(converted.ok && converted.input.discountPercent).toBe(0);
  });

  it("keeps blank optional fields blank and never restores starter terms over the counselor's", () => {
    const row = storedRow({
      intro_message: null,
      terms_and_conditions: null,
      test_prep_lessons: null,
      additional_session_rate_cents: null,
    });
    const values = proposalFormValuesFromRow(row);
    expect(values.termsCustomized).toBe(true);
    expect(values.includeTestPrep).toBe(false);
    const saved = resave(row);
    expect(saved.introMessage).toBeNull();
    // A proposal saved without terms stays without terms.
    expect(saved.termsAndConditions).toBeNull();
    expect(saved.testPrepLessons).toBeNull();
  });

  it("reads numeric(5,2) whether the driver returns a number or a string", () => {
    const row = normalizeProposalRow(
      storedRow({ discount_percent: "10.00" as unknown as number })
    );
    expect(row.discount_percent).toBe(10);
    expect(proposalFormValuesFromRow(row).discountPercent).toBe("10");
  });
});

describe("new proposal form", () => {
  const blank = newProposalFormValues(TODAY);
  const filled: ProposalFormValues = {
    ...blank,
    parentFirstName: "Pat",
    parentLastName: "Rivera",
    parentEmail: "pat@example.com",
    studentFirstName: "Sam",
    studentLastName: "Rivera",
    graduationYear: "2028",
    totalCost: "12,000",
    discountPercent: "10",
  };

  it("opens with starter text, half/half, and a 30-day validity window", () => {
    expect(blank.title).toBe("College Counseling Proposal");
    expect(blank.servicesSummary).toContain("- Personalized college list");
    expect(blank.paymentStructure).toBe("half_half");
    expect(blank.validUntil).toBe("2026-12-12");
    expect(blank.termsCustomized).toBe(false);
  });

  it("derives what was left untyped: discounted cost, the January 1 date, starter terms", () => {
    expect(effectiveDiscountedCents(filled)).toBe(1080000);
    expect(effectiveBalanceDueOn(filled, TODAY)).toBe("2028-01-01");
    expect(effectiveBalanceDueOn({ ...filled, balanceDueOn: "2027-10-01" }, TODAY)).toBe(
      "2027-10-01"
    );
    expect(effectiveBalanceDueOn({ ...filled, graduationYear: "" }, TODAY)).toBe("");
    expect(effectiveTerms(filled)).not.toContain("Test preparation lessons");
    expect(effectiveTerms({ ...filled, includeTestPrep: true })).toContain(
      "Test preparation lessons"
    );
    // Once edited, the text is the counselor's — even when blanked.
    expect(
      effectiveTerms({ ...filled, includeTestPrep: true, termsCustomized: true, termsAndConditions: "" })
    ).toBe("");
  });

  it("a filled-in form validates and saves the derived values", () => {
    const converted = proposalInputFromForm(filled, TODAY);
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    const validated = validateProposalInput(converted.input, TODAY);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.value.discountedCostCents).toBe(1080000);
    expect(validated.value.firstDueOn).toBe("2028-01-01");
    expect(validated.value.termsAndConditions).toContain("No guarantee of admission");
    expect(validated.value.lines.map((l) => l.amountCents)).toEqual([540000, 540000]);
  });

  it("reports what can't be parsed, by field", () => {
    const errorFor = (patch: Partial<ProposalFormValues>) => {
      const result = proposalInputFromForm({ ...filled, ...patch }, TODAY);
      return result.ok ? null : result.error;
    };
    expect(errorFor({ graduationYear: "" })).toBe("Choose the student's graduation year");
    expect(errorFor({ totalCost: "" })).toBe("Enter the total cost");
    expect(errorFor({ totalCost: "twelve" })).toBe("Enter the total cost");
    expect(errorFor({ discountPercent: "150" })).toMatch(/between 0 and 99.99/);
    expect(errorFor({ discountedCost: "abc" })).toBe("Enter a valid discounted cost");
    expect(
      errorFor({ paymentStructure: "deposit_monthly", depositAmount: "lots" })
    ).toBe("Enter a valid deposit amount");
    expect(
      errorFor({ paymentStructure: "deposit_monthly", depositAmount: "2000", installmentCount: "4.5" })
    ).toBe("Enter the number of payments as a whole number");
    expect(errorFor({ includeTestPrep: true, testPrepLessons: "" })).toMatch(
      /how many test preparation lessons/
    );
    expect(
      errorFor({ includeTestPrep: true, testPrepLessons: "10", additionalSessionRate: "free" })
    ).toMatch(/valid cost for additional sessions/);
  });

  it("custom: a first payment with neither a date nor 'at signing' is asked about, never assumed", () => {
    const custom: ProposalFormValues = {
      ...filled,
      paymentStructure: "custom",
      customLines: [
        { key: "a", label: "Everything", amount: "10,800", atSigning: false, dueOn: "" },
      ],
    };
    const undecided = proposalInputFromForm(custom, TODAY);
    expect(undecided).toEqual({
      ok: false,
      error: "Payment 1 needs a due date, or mark it due at signing",
    });
    const atSigning = proposalInputFromForm(
      { ...custom, customLines: [{ ...custom.customLines[0], atSigning: true }] },
      TODAY
    );
    expect(atSigning.ok && atSigning.input.customLines).toEqual([
      { label: "Everything", amountCents: 1080000, dueOn: null },
    ]);
  });

  it("test prep fields are dropped when the pack is switched off", () => {
    const converted = proposalInputFromForm(
      { ...filled, includeTestPrep: false, testPrepLessons: "10", additionalSessionRate: "150" },
      TODAY
    );
    expect(converted.ok && converted.input.testPrepLessons).toBeNull();
    expect(converted.ok && converted.input.additionalSessionRateCents).toBeNull();
  });

  it("formats money the way it is typed", () => {
    expect(centsToInput(1080000)).toBe("10,800");
    expect(centsToInput(1080050)).toBe("10,800.50");
    expect(centsToInput(15000)).toBe("150");
  });
});

describe("proposal row mappings", () => {
  it("the client view carries the proposal and nothing internal", () => {
    const view = toProposalView(storedRow());
    expect(view.parentName).toBe("Pat Rivera");
    expect(view.studentName).toBe("Sam Rivera");
    expect(view.lines).toHaveLength(5);
    expect(Object.keys(view).sort()).toEqual(
      [
        "additionalSessionRateCents",
        "discountPercent",
        "discountedCostCents",
        "graduationYear",
        "introMessage",
        "lines",
        "parentFirstName",
        "parentName",
        "paymentStructure",
        "servicesSummary",
        "studentName",
        "termsAndConditions",
        "testPrepLessons",
        "title",
        "totalCostCents",
        "validUntil",
      ].sort()
    );
    // What is fingerprinted and embedded is the view's terms, schedule included.
    expect(renderProposalTerms(toTermsSource(view))).toContain(
      "5. Monthly payment 4 of 4: $2,200.00 — due June 15, 2027"
    );
  });

  it("an unreadable stored schedule becomes an empty one, not a guess", () => {
    expect(toProposalView(storedRow({ payment_schedule_json: "oops" })).lines).toEqual([]);
  });

  it("unwraps the embedded agreement in either PostgREST shape", () => {
    const agreement = { id: "a1", status: "sent", family_id: "f1" };
    expect(unwrapLinkedAgreement(agreement)).toEqual(agreement);
    expect(unwrapLinkedAgreement([agreement])).toEqual(agreement);
    expect(unwrapLinkedAgreement(null)).toBeNull();
    expect(unwrapLinkedAgreement([])).toBeNull();
  });
});

describe("proposal emails", () => {
  beforeEach(() => {
    sentEmails.length = 0;
  });

  it("the proposal email links the public page, replies to the counselor, and escapes what was typed", async () => {
    const { sendProposalEmail } = await import("@/lib/email");
    await sendProposalEmail({
      email: "pat@example.com",
      parentFirstName: "Pat <b>",
      studentFirstName: "Sam",
      firmName: "Acme & Sons Counseling",
      counselorName: "Jordan Ellis",
      proposalTitle: "Comprehensive <script>alert(1)</script>",
      proposalUrl: "https://app.example.com/proposal/" + "ab12".repeat(12),
      validUntil: "December 12, 2026",
      introMessage: "Line one\n<img src=x onerror=alert(1)>",
      replyTo: "jordan@acme.example",
    });
    expect(sentEmails).toHaveLength(1);
    const email = sentEmails[0];
    expect(email.to).toEqual(["pat@example.com"]);
    expect(email.replyTo).toBe("jordan@acme.example");
    expect(email.subject).toBe(
      "Your proposal from Acme & Sons Counseling: Comprehensive <script>alert(1)</script>"
    );
    expect(email.html).toContain(
      'href="https://app.example.com/proposal/' + "ab12".repeat(12) + '"'
    );
    expect(email.html).toContain("December 12, 2026");
    // Nothing typed by a person reaches the HTML unescaped.
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("Pat &lt;b&gt;");
    expect(email.html).toContain("Acme &amp; Sons Counseling");
    expect(email.html).toContain("Line one<br/>&lt;img src=x onerror=alert(1)&gt;");
    // The plain-text alternative carries the same link and note.
    expect(email.text).toContain("https://app.example.com/proposal/");
    expect(email.text).toContain("Line one");
  });

  it("omits the note block when there is no personal note", async () => {
    const { sendProposalEmail } = await import("@/lib/email");
    await sendProposalEmail({
      email: "pat@example.com",
      parentFirstName: "Pat",
      studentFirstName: "Sam",
      firmName: "Acme",
      counselorName: "Jordan Ellis",
      proposalTitle: "Proposal",
      proposalUrl: "https://app.example.com/proposal/x",
      validUntil: "December 12, 2026",
      introMessage: "   ",
    });
    expect(sentEmails[0].html).not.toContain("<blockquote");
    expect(sentEmails[0].replyTo).toBeUndefined();
  });

  it("the rejection email escapes feedback and links the author to the proposal", async () => {
    const { sendProposalRejectedStaffEmail } = await import("@/lib/email");
    await sendProposalRejectedStaffEmail({
      email: "counselor@example.com", firstName: "Alex", parentName: "Pat <Rivera>",
      studentName: "Sam", proposalTitle: "Counseling", feedback: "Please revise.\n<img src=x onerror=alert(1)>",
      proposalUrl: "https://app.example.com/proposals/123",
    });
    const email = sentEmails[0];
    expect(email.to).toEqual(["counselor@example.com"]);
    expect(email.html).toContain("Pat &lt;Rivera&gt;");
    expect(email.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain('href="https://app.example.com/proposals/123"');
    expect(email.text).toContain("Please revise.\n<img src=x onerror=alert(1)>");
  });

  it("the approval email tells the author who approved and where to continue", async () => {
    const { sendProposalApprovedStaffEmail } = await import("@/lib/email");
    await sendProposalApprovedStaffEmail({
      email: "jordan@acme.example",
      firstName: "Jordan",
      approvedByName: "Pat <Rivera>",
      studentName: "Sam Rivera",
      proposalTitle: "Comprehensive College Counseling",
      proposalUrl: "https://app.example.com/proposals/123",
    });
    const email = sentEmails[0];
    expect(email.to).toEqual(["jordan@acme.example"]);
    expect(email.subject).toBe(
      "Proposal approved: Comprehensive College Counseling (Sam Rivera)"
    );
    expect(email.html).toContain("Pat &lt;Rivera&gt; approved");
    expect(email.html).toContain('href="https://app.example.com/proposals/123"');
  });
});
