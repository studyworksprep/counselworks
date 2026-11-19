import { describe, expect, it } from "vitest";
import { initialAgreementTerms, parseAgreementTerms } from "@/lib/agreements/draft";
import { buildProposalSchedule } from "@/lib/proposals/schedule";

const baseline = () => initialAgreementTerms({ totalFeeCents: 1386000, servicesSummary: "College counseling", testPrepLessons: 10, additionalSessionRateCents: 15000,
  lines: [{ installmentNumber: 1, label: "Deposit (due at signing)", amountCents: 268600, isRetainer: true, dueOn: null },
    ...["2026-11-15", "2027-02-15", "2027-05-15", "2027-08-15"].map((dueOn, i) => ({ installmentNumber: i + 2, label: `Quarterly payment ${i + 1} of 4`, amountCents: 279350, isRetainer: false, dueOn }))] });
describe("agreement term edits", () => {
  it("initializes every editable value and round-trips the accepted quarterly amounts", () => {
    const terms = baseline();
    expect(terms).toMatchObject({ totalFee: "13860.00", testPrepLessons: "10", additionalSessionRate: "150.00", additionalTerms: "" });
    const parsed = parseAgreementTerms(JSON.stringify(terms));
    expect(parsed).toMatchObject({ feeTerms: { totalFeeCents: 1386000, retainerCents: 268600, lines: [expect.objectContaining({ isRetainer: true, dueOn: null }), ...Array(4).fill(expect.objectContaining({ amountCents: 279350 }))] } });
  });
  it("supports revised fees, dates, services, lessons and client-specific terms", () => {
    const terms = baseline(); terms.totalFee = "12000"; terms.servicesSummary = "Revised services";
    terms.testPrepLessons = "12"; terms.additionalSessionRate = "175"; terms.additionalTerms = "Family meetings are included.";
    terms.payments[0].amount = "2000";
    terms.payments.slice(1).forEach((line, i) => { line.amount = "2500"; line.dueOn = `2027-${String(1 + i * 3).padStart(2, "0")}-15`; });
    const result = parseAgreementTerms(JSON.stringify(terms));
    expect(result).toMatchObject({ feeTerms: { totalFeeCents: 1200000, retainerCents: 200000 }, servicesSummary: "Revised services", testPrepLessons: 12, additionalSessionRateCents: 17500, additionalTerms: terms.additionalTerms });
    if ("error" in result) throw new Error(result.error);
    expect(result.feeTerms.lines.map((line) => line.dueOn)).toEqual([null, "2027-01-15", "2027-04-15", "2027-07-15", "2027-10-15"]);
  });
  it.each(["amount", "sum", "date", "order", "retainer", "fee", "rate", "services", "lessons", "too_many"])("rejects invalid %s before a contract can be previewed", (problem) => {
    const terms = baseline();
    if (problem === "amount") terms.payments[1].amount = "-100";
    if (problem === "sum") terms.payments[1].amount = "100";
    if (problem === "date") terms.payments[1].dueOn = "2027-02-30";
    if (problem === "order") terms.payments[1].dueOn = "2030-01-01";
    if (problem === "retainer") terms.payments[2].atSigning = true;
    if (problem === "fee") terms.totalFee = "9999999999999999999999";
    if (problem === "rate") { terms.testPrepLessons = "0"; terms.additionalSessionRate = "100"; }
    if (problem === "services") terms.servicesSummary = " ";
    if (problem === "lessons") terms.testPrepLessons = "1.5";
    if (problem === "too_many") terms.payments = Array(38).fill(terms.payments[1]);
    expect(parseAgreementTerms(JSON.stringify(terms))).toHaveProperty("error");
  });
  it("rejects malformed or oversized data and does not trust posted computed fields", () => {
    expect(parseAgreementTerms("not JSON")).toHaveProperty("error");
    expect(parseAgreementTerms("x".repeat(50001))).toHaveProperty("error");
    const terms = baseline();
    expect(parseAgreementTerms(JSON.stringify({ ...terms, totalFeeCents: 1, retainerCents: 1 }))).toMatchObject({ feeTerms: { totalFeeCents: 1386000, retainerCents: 268600 } });
  });
  it("removes embedded generated dates from editable half/half descriptions", () => {
    const schedule = buildProposalSchedule({ structure: "half_half", totalCents: 1000000, depositCents: null, installmentCount: null, firstDueOn: "2027-01-01", customLines: [] });
    if (!schedule.ok) throw new Error(schedule.error);
    const terms = initialAgreementTerms({ totalFeeCents: 1000000, servicesSummary: "Counseling", testPrepLessons: null, additionalSessionRateCents: null, lines: schedule.lines });
    terms.payments[1].dueOn = "2027-02-01";
    expect(terms.payments[1].label).not.toContain("January");
    expect(terms.payments[1].label).toContain("final application");
    expect(parseAgreementTerms(JSON.stringify(terms))).toMatchObject({ feeTerms: { lines: [expect.anything(), expect.objectContaining({ dueOn: "2027-02-01" })] } });
  });
});
