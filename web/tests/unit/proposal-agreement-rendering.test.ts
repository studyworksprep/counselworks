import { describe, expect, it } from "vitest";
import { defaultEngagementDates, engagementAgreementVars } from "@/lib/agreements/engagement";
import { prepareAgreementDocument } from "@/lib/agreements/snapshot";
import { buildProposalSchedule } from "@/lib/proposals/schedule";
import { renderSignedAgreementPdf } from "@/lib/agreements/pdf";
import { parseAgreementMarkdown } from "@/lib/agreements/markdown";

const dates = { serviceEndDate: "2027-12-31", refundDeadline: "2027-05-31" };
const source = { studentName: "Sam Rivera", graduationYear: 2028, servicesSummary: "- Essay coaching\n- College list planning", testPrepLessons: 10, additionalSessionRateCents: 15000 };
const template = { id: "template", name: "College Admissions Consulting Agreement", body: "# College Admissions Consulting Agreement\n\n{{family_name}} and {{firm_name}}, {{date}}.\n\n## Services\n\n{{services}}\n\n{{test_preparation}}\n\nTotal ${{total_fee}}, signing ${{deposit_fee}}, remaining ${{remaining_fee}}.\n\n{{payment_schedule}}\n\n## Cancellation\n\nThe first {{half_fee}} (50% of the fee) is non-refundable. Payments are applied first to that amount. Refund cutoff: {{refund_deadline}}.\n\nServices continue through {{service_end_date}}." };

function render(structure: "half_half" | "deposit_monthly" | "deposit_quarterly" | "custom" = "deposit_monthly") {
  const schedule = buildProposalSchedule({ structure, totalCents: 760000, depositCents: 114000, installmentCount: 12, firstDueOn: "2027-01-01",
    customLines: [{ label: "Signing", amountCents: 114000, dueOn: null }, { label: "Balance", amountCents: 646000, dueOn: "2027-06-01" }] });
  if (!schedule.ok) throw new Error(schedule.error);
  const result = prepareAgreementDocument({ template, familyName: "Rivera Family", firmName: "Studyworks", todayIso: "2026-11-18",
    feeTerms: { totalFeeCents: 760000, retainerCents: schedule.lines.filter((l) => l.isRetainer).reduce((sum, l) => sum + l.amountCents, 0), lines: schedule.lines },
    engagement: engagementAgreementVars(source, dates) });
  if ("error" in result) throw new Error(result.error);
  return result.document;
}

describe("standalone agreement rendering", () => {
  it("uses the confirmed admissions-cycle date defaults", () => {
    expect(defaultEngagementDates(2028)).toEqual(dates);
    expect(defaultEngagementDates(2030)).toEqual({ serviceEndDate: "2029-12-31", refundDeadline: "2029-05-31" });
  });
  it.each(["half_half", "deposit_monthly", "deposit_quarterly", "custom"] as const)("uses only the selected %s schedule and prints it once", (structure) => {
    const { body } = render(structure);
    expect(body).toContain("Total $7,600.00");
    expect(body.match(/ENGAGEMENT FEE & PAYMENT SCHEDULE/g)).toHaveLength(1);
    expect(body).toContain("The first $3,800.00 (50% of the fee) is non-refundable");
    expect(body).toContain("10 test preparation lessons are included");
    expect(body).toContain("$150.00 per session");
    expect(body).not.toMatch(/proposal|accepted by|valid through|\{\{|\$\$/i);
    if (structure === "deposit_monthly") {
      expect(body).toContain("signing $1,140.00, remaining $6,460.00");
      expect(body.match(/Monthly payment 12 of 12/g)).toHaveLength(1);
      expect(body).not.toContain("Quarterly payment");
    }
  });
  it("renders structured headings and survives the signed PDF renderer", async () => {
    const document = render();
    expect(parseAgreementMarkdown(document.body).filter((block) => block.type === "heading").length).toBeGreaterThanOrEqual(3);
    const pdf = await renderSignedAgreementPdf({ title: document.title, firmName: "Studyworks", body: document.body, documentHash: document.documentHash, signatures: [] });
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
