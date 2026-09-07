import { notFound } from "next/navigation";
import {
  getFamilyByIdCached,
  getFamilyAgreements,
  getFamilyInvoices,
  getAgreementTemplates,
} from "@/lib/db/queries";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { ServiceAgreementCard } from "../service-agreement-card";
import { InvoicesCard } from "@/components/billing/invoices-card";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Family Billing (fix plan 13.0): the engagement agreement (send, sign for
 * the firm, secure signing link, remediation) and the household's invoices.
 * Billing belongs to the family, so this is the one place it is managed;
 * the student workspace's Family & Billing page links here.
 */
export default async function FamilyBillingPage({ params }: Props) {
  const { id } = await params;
  const [family, ctx, agreements, agreementTemplates, invoices] =
    await Promise.all([
      getFamilyByIdCached(id),
      resolveUserAndFirm(),
      getFamilyAgreements(id),
      getAgreementTemplates(),
      getFamilyInvoices(id),
    ]);
  if (!family) return notFound();

  const canSend =
    !!ctx &&
    hasPermission(
      { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] },
      "manage_clients"
    );

  return (
    <div className="space-y-6">
      <ServiceAgreementCard
        familyId={family.id}
        agreements={agreements}
        templates={agreementTemplates.map((t) => ({ id: t.id, name: t.name }))}
        canSend={canSend}
        invoiceGenerationNeeded={agreements
          .filter(
            (a) =>
              a.status === "completed" &&
              a.total_fee_cents !== null &&
              invoices.filter((i) => i.agreement_id === a.id && i.document_id)
                .length < a.installments.length
          )
          .map((a) => a.id)}
      />
      <InvoicesCard invoices={invoices} />
    </div>
  );
}
