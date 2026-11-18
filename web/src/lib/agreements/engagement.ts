import type { AgreementVars } from "./render";
import { formatLongDate, testPrepLines, type ProposalTermsSource } from "../proposals/terms";

/** Admissions-cycle dates fall in the year before graduation and remain editable. */
export function defaultEngagementDates(graduationYear: number) {
  return { serviceEndDate: `${graduationYear - 1}-12-31`, refundDeadline: `${graduationYear - 1}-05-31` };
}

/** Client-specific contract details without proposal history, validity or approval wording. */
export function engagementAgreementVars(source: Pick<ProposalTermsSource,
  "studentName" | "graduationYear" | "servicesSummary" | "testPrepLessons" | "additionalSessionRateCents"
>, dates: { serviceEndDate: string; refundDeadline: string }): Partial<AgreementVars> {
  const lessons = testPrepLines(source);
  return {
    student_name: source.studentName,
    graduation_year: String(source.graduationYear),
    services: source.servicesSummary.trim(),
    test_preparation: lessons.length ? lessons.map((line) => `- ${line}`).join("\n") : "No test preparation lessons are included in this engagement.",
    service_end_date: dates.serviceEndDate ? formatLongDate(dates.serviceEndDate) : undefined,
    refund_deadline: dates.refundDeadline ? formatLongDate(dates.refundDeadline) : undefined,
  };
}
