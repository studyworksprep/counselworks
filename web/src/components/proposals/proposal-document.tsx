import { AgreementBody } from "@/components/agreements/agreement-body";
import { formatCents } from "@/lib/agreements/schedule";
import { formatPercent } from "@/lib/proposals/pricing";
import { formatLongDate } from "@/lib/proposals/terms";
import type { ProposalView } from "@/lib/proposals/row";
import { paymentOptionLabel } from "@/lib/proposals/payment-options";
import { ProposalNextSteps } from "./proposal-next-steps";

function SectionHeading({ number, children }: { number: string; children: React.ReactNode }) {
  return (
    <h2 className="mb-5 flex items-center gap-3 font-serif text-2xl text-primary-900">
      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 font-sans text-xs font-semibold text-primary-700">{number}</span>
      {children}
    </h2>
  );
}

/** One document for the client and staff preview. All authored text stays React text nodes. */
export function ProposalDocument({ view }: { view: ProposalView }) {
  const discounted = view.discountedCostCents < view.totalCostCents;
  const options = view.selectedPaymentStructure ? view.paymentOptions.filter((option) => option.structure === view.selectedPaymentStructure) : view.paymentOptions;

  return (
    <div className="space-y-6">
      <ProposalNextSteps />
      <article aria-label="Proposal document" className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_40px_-20px_rgba(16,42,67,0.2)]">
        <div className="h-1 bg-[#bf8700]" />
        <div className="border-b border-gray-100 bg-[#fcfbf8] px-6 py-7 sm:px-10 sm:py-8">
          <dl className="grid gap-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Prepared for</dt>
              <dd className="mt-1.5 text-base font-semibold text-primary-900">{view.parentName}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Supporting</dt>
              <dd className="mt-1.5 text-base font-semibold text-primary-900">{view.studentName} · Class of {view.graduationYear}</dd>
            </div>
          </dl>
          {view.introMessage && <p className="mt-6 whitespace-pre-line border-t border-gray-200/70 pt-5 text-sm leading-7 text-gray-700">{view.introMessage}</p>}
        </div>

        <div className="divide-y divide-gray-100 px-6 sm:px-10">
          <section className="py-8 sm:py-10">
            <SectionHeading number="01">What&apos;s included</SectionHeading>
            <div className="[&_li]:py-0.5 [&_p]:leading-7"><AgreementBody source={view.servicesSummary} /></div>
            {view.testPrepLessons ? (
              <div className="mt-6 rounded-xl border border-[#e8dfc8] bg-[#fbf8f0] p-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#755300]">Test preparation</h3>
                <p className="text-sm leading-relaxed text-gray-800">{view.testPrepLessons} test preparation lesson{view.testPrepLessons === 1 ? "" : "s"} included at no additional charge</p>
                {view.additionalSessionRateCents ? <p className="mt-2 text-sm leading-relaxed text-gray-600">Additional sessions after the included lessons are used: <span className="font-semibold text-gray-800">{formatCents(view.additionalSessionRateCents)} per session</span></p> : null}
              </div>
            ) : null}
          </section>

          <section className="py-8 sm:py-10">
            <SectionHeading number="02">Your investment</SectionHeading>
            <div className="grid items-start gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-xl bg-primary-900 p-6 text-white">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/80">{discounted ? "Total after discount" : "Total program fee"}</p>
                <p data-testid="proposal-total" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{formatCents(view.discountedCostCents)}</p>
                {discounted && (
                  <dl className="mt-5 space-y-2 border-t border-white/20 pt-4 text-sm">
                    <div className="flex justify-between gap-3 text-white/80"><dt>Program fee</dt><dd className="line-through decoration-white/50">{formatCents(view.totalCostCents)}</dd></div>
                    <div className="flex justify-between gap-3 text-white"><dt>Discount ({formatPercent(view.discountPercent)})</dt><dd>−{formatCents(view.totalCostCents - view.discountedCostCents)}</dd></div>
                  </dl>
                )}
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-primary-900">{view.selectedPaymentStructure ? "Selected payment option" : options.length > 1 ? "Your payment options" : "Payment schedule"}</h3>
                {options.length > 1 && <p className="mb-4 text-sm leading-relaxed text-gray-600">The total fee is the same with every option. Choose the schedule you prefer when approving below.</p>}
                {options.length === 0 ? <p className="text-sm text-danger-700">The payment schedule for this proposal could not be read.</p> : (
                  <div className="space-y-4">
                    {options.map((option) => <section key={option.structure} aria-label={paymentOptionLabel(option.structure)} className="rounded-xl border border-gray-200 p-4">
                      <h4 className="mb-3 text-sm font-semibold text-primary-900">{paymentOptionLabel(option.structure)}</h4>
                      <ol className="divide-y divide-gray-100">
                        {option.lines.map((line) => (
                          <li key={line.installmentNumber} className="flex items-start justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0">
                            <div className="min-w-0"><p className="text-gray-700">{line.label}</p>{line.dueOn && <p className="mt-1 text-xs text-gray-500">Due {formatLongDate(line.dueOn)}</p>}</div>
                            <span className="shrink-0 font-semibold tabular-nums text-primary-900">{formatCents(line.amountCents)}</span>
                          </li>
                        ))}
                      </ol>
                    </section>)}
                  </div>
                )}
              </div>
            </div>
          </section>

          {view.termsAndConditions && (
            <details className="group py-6 sm:py-7">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm text-sm font-semibold text-primary-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600 [&::-webkit-details-marker]:hidden">
                Program details to review
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"><path d="m5 7.5 5 5 5-5" /></svg>
              </summary>
              <p className="mb-4 mt-3 text-sm leading-relaxed text-gray-600">These notes provide context for the proposed plan. You&apos;ll receive a separate service agreement to review and sign.</p>
              <div className="[&_p]:leading-7"><AgreementBody source={view.termsAndConditions} /></div>
            </details>
          )}
        </div>
        <p className="border-t border-gray-100 bg-[#fcfbf8] px-6 py-4 text-center text-xs leading-relaxed text-gray-600">This proposal is valid through {formatLongDate(view.validUntil)}.</p>
      </article>
    </div>
  );
}
