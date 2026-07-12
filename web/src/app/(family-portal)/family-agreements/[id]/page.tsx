import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPortalAgreementById } from "@/lib/db/queries";
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

  return (
    <PageShell
      title={agreement.title}
      description={`Sent ${formatDate(agreement.sent_at)}`}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
              {agreement.body_snapshot}
            </p>
            <p className="mt-6 border-t border-gray-100 pt-3 text-[11px] text-gray-400">
              Document integrity hash (SHA-256): {agreement.document_hash}
            </p>
          </CardContent>
        </Card>

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
