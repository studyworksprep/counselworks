import { Card, CardContent } from "@/components/ui/card";
import { AgreementBody } from "@/components/agreements/agreement-body";
import { formatCents } from "@/lib/agreements/schedule";
import { formatPercent } from "@/lib/proposals/pricing";
import { formatLongDate } from "@/lib/proposals/terms";
import type { ProposalView } from "@/lib/proposals/row";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-base font-semibold text-gray-900">{children}</h2>
  );
}

/**
 * The proposal as the client reads it. One component for the public page
 * and the staff preview, so "what the client sees" is never a second
 * implementation. Presentation only: it renders a `ProposalView`, which
 * carries nothing that isn't meant for the prospect. Free-text fields go
 * through `AgreementBody` (light markdown → React text nodes, never HTML).
 */
export function ProposalDocument({ view }: { view: ProposalView }) {
  const discounted = view.discountedCostCents < view.totalCostCents;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 py-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Prepared for
              </dt>
              <dd className="mt-0.5 font-medium text-gray-900">{view.parentName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Student
              </dt>
              <dd className="mt-0.5 font-medium text-gray-900">
                {view.studentName} · Class of {view.graduationYear}
              </dd>
            </div>
          </dl>
          {view.introMessage && (
            <p className="whitespace-pre-line border-t border-gray-100 pt-4 text-sm leading-relaxed text-gray-800">
              {view.introMessage}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-6">
          <SectionHeading>What&apos;s included</SectionHeading>
          <AgreementBody source={view.servicesSummary} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-6">
          <SectionHeading>Your investment</SectionHeading>
          <dl className="space-y-2 text-sm">
            {discounted && (
              <>
                <div className="flex justify-between gap-4 text-gray-700">
                  <dt>Program fee</dt>
                  <dd>{formatCents(view.totalCostCents)}</dd>
                </div>
                <div className="flex justify-between gap-4 text-success-700">
                  <dt>Discount ({formatPercent(view.discountPercent)})</dt>
                  <dd>
                    −{formatCents(view.totalCostCents - view.discountedCostCents)}
                  </dd>
                </div>
              </>
            )}
            <div
              className={
                "flex justify-between gap-4 text-base font-semibold text-gray-900" +
                (discounted ? " border-t border-gray-200 pt-2" : "")
              }
            >
              <dt>{discounted ? "Total after discount" : "Total"}</dt>
              <dd data-testid="proposal-total">
                {formatCents(view.discountedCostCents)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-6">
          <SectionHeading>Payment schedule</SectionHeading>
          {view.lines.length === 0 ? (
            <p className="text-sm text-danger-700">
              The payment schedule for this proposal could not be read.
            </p>
          ) : (
            <ol className="space-y-2">
              {view.lines.map((line) => (
                <li
                  key={line.installmentNumber}
                  className="flex justify-between gap-4 border-b border-gray-100 pb-2 text-sm text-gray-700 last:border-0 last:pb-0"
                >
                  <span>
                    {line.label}
                    {line.dueOn && (
                      <span className="block text-xs text-gray-500">
                        Due {formatLongDate(line.dueOn)}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-medium text-gray-900">
                    {formatCents(line.amountCents)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {view.testPrepLessons ? (
        <Card>
          <CardContent className="py-6">
            <SectionHeading>Test preparation</SectionHeading>
            <ul className="list-disc space-y-1 pl-6 text-sm text-gray-800">
              <li>
                {view.testPrepLessons} test preparation lesson
                {view.testPrepLessons === 1 ? "" : "s"} included at no additional
                charge
              </li>
              {view.additionalSessionRateCents ? (
                <li>
                  Additional sessions after the included lessons are used:{" "}
                  <span className="font-medium">
                    {formatCents(view.additionalSessionRateCents)} per session
                  </span>
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {view.termsAndConditions && (
        <Card>
          <CardContent className="py-6">
            <SectionHeading>Terms &amp; conditions</SectionHeading>
            <AgreementBody source={view.termsAndConditions} />
          </CardContent>
        </Card>
      )}

      <p className="text-center text-sm text-gray-500">
        This proposal is valid through {formatLongDate(view.validUntil)}.
      </p>
    </div>
  );
}
