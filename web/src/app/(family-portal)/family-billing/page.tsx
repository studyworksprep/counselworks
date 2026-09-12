import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { InvoicesCard } from "@/components/billing/invoices-card";
import { getPortalInvoices, getPortalAgreements } from "@/lib/db/queries";
export default async function FamilyBillingPage() {
  const [invoices, agreements] = await Promise.all([getPortalInvoices(),getPortalAgreements()]);
  return <PageShell title="Billing & agreements" description="Your household's invoices and service agreements">
    <Link className="mb-6 inline-block text-primary-700 underline" href="/family-dashboard">Back to family dashboard</Link>
    {invoices.length ? <InvoicesCard invoices={invoices} canPay/> : <p>No invoices yet.</p>}
    <section className="mt-8 space-y-3"><h2 className="text-lg font-semibold">Service agreements</h2>
      {agreements.length ? <ul className="space-y-3">{agreements.map(agreement=><li key={agreement.id}><Link className="text-primary-700 underline" href={`/family-agreements/${agreement.id}`}>{agreement.title}</Link>{((agreement.status==='sent'||agreement.status==='partially_signed')&&!agreement.signed_roles.includes('family')) && <span className="ml-2 text-sm text-warning-800">Your signature is needed</span>}</li>)}</ul> : <p>No agreements yet.</p>}
    </section>
  </PageShell>;
}
