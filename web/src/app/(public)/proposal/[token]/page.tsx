import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FirmTheme } from "@/components/brand/firm-theme";
import { ProposalDocument } from "@/components/proposals/proposal-document";
import { loadProposalLink } from "@/lib/proposals/public-link";
import { approveProposalByToken } from "@/lib/actions/public-proposal";
import { formatLongDate } from "@/lib/proposals/terms";
import { ProposalApproveForm } from "./approve-form";

interface Props {
  params: Promise<{ token: string }>;
}

// A secret-token page: never something a search engine should list.
export const metadata: Metadata = {
  title: "Your proposal",
  robots: { index: false, follow: false },
};

/**
 * Public proposal page: the prospective client reviews and approves with
 * no account. Authenticated by the token alone; an unknown, draft, or
 * withdrawn proposal is a plain 404. Renders the same `ProposalDocument`
 * the counselor previewed.
 */
export default async function PublicProposalPage({ params }: Props) {
  const { token } = await params;
  const link = await loadProposalLink(token);
  if (!link) return notFound();

  const { view, firm, author } = link;
  // Bound server action: the token and the fingerprint of the terms on
  // screen travel inside the action, not as props the form could swap.
  const approve = approveProposalByToken.bind(null, token, link.termsFingerprint);

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
            <h1 className="text-2xl font-semibold text-gray-900">{view.title}</h1>
          </div>
        </header>

        {link.status === "approved" && (
          <div className="mb-6 rounded-xl bg-success-50 px-4 py-3 text-sm text-success-800">
            <p className="font-medium">
              Approved
              {link.approvedOn ? ` on ${formatLongDate(link.approvedOn)}` : ""} —
              thank you!
            </p>
            <p className="mt-1">
              {link.agreementIssued
                ? `Your service agreement has been emailed to ${link.parentEmail}. Signing it is the final step.`
                : `${firm.name} will email the service agreement to ${link.parentEmail} for signature. Services begin once it is signed.`}
            </p>
          </div>
        )}
        {link.expired && (
          <div className="mb-6 rounded-xl bg-warning-50 px-4 py-3 text-sm text-warning-800">
            This proposal expired on {formatLongDate(view.validUntil)}. Please
            contact {author?.name ?? firm.name} for an updated proposal.
          </div>
        )}

        <ProposalDocument view={view} />

        <div className="mt-6 space-y-6">
          {link.status === "sent" && !link.expired && (
            <ProposalApproveForm
              approve={approve}
              firmName={firm.name}
              parentFirstName={view.parentFirstName}
            />
          )}

          <p className="pt-2 text-center text-xs text-gray-500">
            {author && (
              <>
                Questions? Contact {author.name} at{" "}
                <a href={`mailto:${author.email}`} className="underline">
                  {author.email}
                </a>
                .{" "}
              </>
            )}
            This page is private to {link.parentEmail} — please don&apos;t
            forward the link.
          </p>
        </div>
      </div>
    </FirmTheme>
  );
}
