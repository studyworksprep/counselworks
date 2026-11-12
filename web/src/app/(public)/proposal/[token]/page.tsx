import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { FirmTheme } from "@/components/brand/firm-theme";
import { Badge } from "@/components/ui/badge";
import { ProposalDocument } from "@/components/proposals/proposal-document";
import { loadProposalLink } from "@/lib/proposals/public-link";
import { approveProposalByToken, rejectProposalByToken } from "@/lib/actions/public-proposal";
import { formatLongDate } from "@/lib/proposals/terms";
import { ProposalApproveForm } from "./approve-form";

interface Props { params: Promise<{ token: string }> }

export const metadata: Metadata = {
  title: "Your proposal | Review & respond",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Secret-token page: no account is required, and no other client's data is exposed. */
export default async function PublicProposalPage({ params }: Props) {
  const { token } = await params;
  const link = await loadProposalLink(token);
  if (!link) return notFound();
  const { view, firm, author } = link;
  const approve = approveProposalByToken.bind(null, token, link.termsFingerprint);
  const reject = rejectProposalByToken.bind(null, token, link.termsFingerprint);
  // Preserve configured white-label logos; only Studyworks gets this brand fallback.
  const studyworks = /study\s*works/i.test(firm.name);
  const logoUrl = firm.logoUrl ?? (studyworks ? "/studyworks-logo.svg" : null);

  return (
    <FirmTheme primaryColor={firm.primaryColor ?? (studyworks ? "#102a43" : null)}>
      <main className="min-h-screen bg-[#f7f6f2]">
        <div className="h-1.5 bg-primary-900" />
        <div className="mx-auto max-w-4xl px-4 pb-10 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/80 py-6 sm:py-8">
            {logoUrl ? logoUrl === "/studyworks-logo.svg" ? (
              <Image src={logoUrl} alt={firm.name} width={220} height={53} priority className="h-auto w-48 sm:w-56" />
            ) : (
              // Configured remote logos have varying hosts and aspect ratios.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={firm.name} className="max-h-14 max-w-56 object-contain object-left" />
            ) : <p className="font-serif text-2xl font-semibold text-primary-900">{firm.name}</p>}
            <p className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              Private proposal
            </p>
          </header>

          <section className="py-8 sm:py-10">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-700">A plan for the next chapter</p>
              <Badge variant={link.status === "approved" ? "success" : link.status === "rejected" ? "danger" : link.expired ? "warning" : "primary"}>
                {link.status === "approved" ? "Approved" : link.status === "rejected" ? "Rejected" : link.expired ? "Expired" : "Prepared for your family"}
              </Badge>
            </div>
            <h1 className="font-serif text-3xl leading-tight tracking-tight text-primary-900 sm:text-4xl lg:text-5xl">{view.title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-600 sm:text-base">Explore your proposed plan. If it feels right, give us the go-ahead to prepare a separate service agreement for your review.</p>
          </section>

          {link.status === "approved" && (
            <section className="mb-6 rounded-2xl border border-success-200 bg-success-50 p-6 text-sm leading-relaxed text-success-900" aria-label="Proposal approval">
              <h2 className="text-lg font-semibold">Approved{link.approvedOn ? ` on ${formatLongDate(link.approvedOn)}` : ""} — thank you!</h2>
              <p className="mt-2 font-semibold">Your proposal approval is recorded. No contract has been signed by approving this proposal.</p>
              <p className="mt-2">{link.agreementIssued ? `Your service agreement has been emailed to ${link.parentEmail}. Signing it is the final step.` : `${firm.name} will email the service agreement to ${link.parentEmail} for signature. Services begin once it is signed.`}</p>
            </section>
          )}
          {link.status === "rejected" && (
            <section className="mb-6 rounded-2xl border border-warning-200 bg-warning-50 p-6" aria-label="Proposal rejection">
              <h2 className="text-lg font-semibold text-gray-900">Proposal rejected</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-700">Your feedback has been saved for {author?.name ?? firm.name} to review. They can send you a revised proposal.</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-warning-900">Your feedback{link.rejectedOn ? ` · ${formatLongDate(link.rejectedOn)}` : ""}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">{link.rejectionComment}</p>
            </section>
          )}
          {link.expired && <p className="mb-6 rounded-xl bg-warning-50 px-4 py-3 text-sm text-warning-800">This proposal expired on {formatLongDate(view.validUntil)}. Please contact {author?.name ?? firm.name} for an updated proposal.</p>}

          <ProposalDocument view={view} />
          {link.status === "sent" && !link.expired && <div className="mt-7"><ProposalApproveForm approve={approve} reject={reject} firmName={firm.name} parentFirstName={view.parentFirstName} /></div>}

          <footer className="mt-8 border-t border-gray-200 pt-6 text-center text-xs leading-relaxed text-gray-600">
            {author && <p className="mb-2">Questions? Contact {author.name} at <a href={`mailto:${author.email}`} className="break-all font-medium text-primary-700 underline underline-offset-2">{author.email}</a>.</p>}
            <p>This page is private to <span className="break-all">{link.parentEmail}</span> — please don&apos;t forward the link.</p>
          </footer>
        </div>
      </main>
    </FirmTheme>
  );
}
