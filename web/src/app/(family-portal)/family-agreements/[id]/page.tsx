import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPortalAgreementById, type AgreementInstallment } from "@/lib/db/queries";
import { formatCents } from "@/lib/agreements/schedule";
import { AgreementBody } from "@/components/agreements/agreement-body";
import { formatDate } from "@/lib/utils";
import { PortalSignForm } from "./portal-sign-form";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Family-portal agreement review & signing page (fix plan 10.1). Shows the
 * exact immutable text being signed, the execution state, and the
 * consent + typed-signature form.
 */
export default async function FamilyAgreementPage({ params }: Props) {
  const { id } = await params;
  const agreement = await getPortalAgreementById(id);
  if (!agreement) return notFound();

  const signatures = (agreement.agreement_signatures ?? []) as {
    signer_role: string;
    signed_name: string;
    signed_at: string;
  }[];
  const familySigned = signatures.some((s) => s.signer_role === "family");
  const installments = (
    (agreement.agreement_installments ?? []) as AgreementInstallment[]
  ).sort((a, b) => a.installment_number - b.installment_number);

  return (
    <PageShell
      title={agreement.title}
      description={`Sent ${formatDate(agreement.sent_at)}`}
    >
      <div className="mx-auto max-w-3xl space-y-6">
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
                  {formatCents(agreement.total_fee_cents as number)}
                </span>
              </p>
              {installments.length > 0 && (
                <ul className="space-y-1">
                  {installments.map((i) => (
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

        {signatures.length > 0 && (
          <Card>
            <CardContent>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">
                Signatures
              </h3>
              <ul className="space-y-1">
                {signatures.map((s) => (
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

        {agreement.status === "completed" ? (
          <Card>
            <CardContent>
              <p className="text-sm text-success-700">
                This agreement is fully executed. The signed PDF is available
                under Documents.
              </p>
            </CardContent>
          </Card>
        ) : agreement.status === "voided" ? (
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">
                This agreement was voided by the firm and can no longer be
                signed.
              </p>
            </CardContent>
          </Card>
        ) : familySigned ? (
          <Card>
            <CardContent>
              <p className="text-sm text-gray-600">
                You&apos;ve signed. Waiting for the firm&apos;s countersignature.
              </p>
            </CardContent>
          </Card>
        ) : (
          <PortalSignForm agreementId={agreement.id} />
        )}
      </div>
    </PageShell>
  );
}
