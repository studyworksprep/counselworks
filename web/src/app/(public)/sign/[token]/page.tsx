import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FirmTheme } from "@/components/brand/firm-theme";
import { InvoicesCard } from "@/components/billing/invoices-card";
import { loadSigningLink } from "@/lib/agreements/signing-link";
import { payInvoiceByToken } from "@/lib/actions/public-agreement";
import { formatCents } from "@/lib/agreements/schedule";
import { AgreementBody } from "@/components/agreements/agreement-body";
import { formatDate } from "@/lib/utils";
import { PublicSignForm } from "./public-sign-form";

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ payment?: string }>;
}

/**
 * Secure signing link (fix plan 12.7): the household reviews, signs, and
 * pays with no portal account. Authenticated by the token alone; an
 * unknown, voided, or rotated token is a plain 404. Everything rendered
 * here is the recipient's own agreement — the same text, fee schedule,
 * signatures, and invoices the family portal shows.
 */
export default async function PublicSigningPage({ params, searchParams }: Props) {
  const [{ token }, { payment }] = await Promise.all([params, searchParams]);
  const link = await loadSigningLink(token);
  if (!link) return notFound();

  const { agreement, firm, recipient, invoices } = link;
  const familySigned = agreement.signatures.some(
    (s) => s.signer_role === "family"
  );
  const completed = agreement.status === "completed";
  // Bound server action: the client button never sees the token as a prop
  // it could swap — the token travels inside the action closure.
  const pay = payInvoiceByToken.bind(null, token);

  return (
    <FirmTheme primaryColor={firm.primaryColor}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <header className="mb-6 flex items-center gap-3">
          {firm.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={firm.logoUrl}
              alt=""
              className="h-10 w-10 rounded-lg object-contain"
            />
          ) : null}
          <div>
            <p className="text-sm text-gray-500">{firm.name}</p>
            <h1 className="text-2xl font-semibold text-gray-900">
              {agreement.title}
            </h1>
            <p className="text-sm text-gray-500">
              For {link.householdName} · sent {formatDate(agreement.sent_at)}
            </p>
          </div>
        </header>

        {payment === "submitted" && (
          <div className="mb-6 rounded-xl bg-success-50 px-4 py-3 text-sm font-medium text-success-800">
            Payment submitted — the invoice will show as paid once the payment
            is confirmed (usually within a few seconds).
          </div>
        )}
        {payment === "canceled" && (
          <div className="mb-6 rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-600">
            Payment canceled — the invoice is unchanged.
          </div>
        )}

        <div className="space-y-6">
          <Card>
            <CardContent>
              <AgreementBody source={agreement.body_snapshot} />
              <p className="mt-6 border-t border-gray-100 pt-3 text-[11px] text-gray-400">
                Document integrity hash (SHA-256): {agreement.document_hash}
              </p>
            </CardContent>
          </Card>

          {agreement.total_fee_cents !== null && (
            <Card>
              <CardContent>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">
                  Engagement Fee &amp; Payment Schedule
                </h3>
                <p className="mb-2 text-sm text-gray-700">
                  Total engagement fee:{" "}
                  <span className="font-medium">
                    {formatCents(agreement.total_fee_cents)}
                  </span>
                </p>
                {agreement.installments.length > 0 && (
                  <ul className="space-y-1">
                    {agreement.installments.map((i) => (
                      <li
                        key={i.installment_number}
                        className="flex justify-between border-b border-gray-50 pb-1 text-sm text-gray-700 last:border-0"
                      >
                        <span>
                          {i.label}
                          {i.due_on && ` — due ${formatDate(i.due_on)}`}
                        </span>
                        <span className="font-medium">
                          {formatCents(i.amount_cents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {agreement.signatures.length > 0 && (
            <Card>
              <CardContent>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">
                  Signatures
                </h3>
                <ul className="space-y-1">
                  {agreement.signatures.map((s) => (
                    <li
                      key={s.signer_role}
                      className="flex items-center gap-2 text-sm text-gray-700"
                    >
                      <Badge variant="success">
                        {s.signer_role === "firm" ? "Firm" : "Family"}
                      </Badge>
                      {s.signed_name} · {formatDate(s.signed_at)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {completed ? (
            <Card>
              <CardContent>
                <p className="text-sm text-success-700">
                  This agreement is fully executed. A signed copy has been
                  emailed to {recipient.email}
                  {invoices.length > 0 &&
                    ", and your invoices are below — each can be paid online"}
                  .
                </p>
              </CardContent>
            </Card>
          ) : familySigned ? (
            <Card>
              <CardContent>
                <p className="text-sm text-gray-700">
                  Thanks — your signature is recorded. Waiting for the firm to
                  countersign; you&apos;ll receive an email when the agreement
                  is fully executed.
                </p>
              </CardContent>
            </Card>
          ) : (
            <PublicSignForm token={token} recipientName={recipient.first_name} />
          )}

          {invoices.length > 0 && (
            <InvoicesCard
              invoices={invoices}
              canPay={completed && link.onlinePaymentAvailable}
              pay={pay}
              showDownloads={false}
            />
          )}
          {completed && invoices.length > 0 && !link.onlinePaymentAvailable && (
            <p className="text-sm text-gray-500">
              {firm.name} hasn&apos;t enabled online payment yet — they will
              let you know how to pay.
            </p>
          )}

          <p className="pt-4 text-center text-xs text-gray-400">
            This page is private to {recipient.email} — please don&apos;t
            forward the link. Already have a family portal account?{" "}
            <Link href="/sign-in" className="underline hover:text-gray-600">
              Sign in
            </Link>
            .
          </p>
        </div>
      </div>
    </FirmTheme>
  );
}
