import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { ProposalDocument } from "@/components/proposals/proposal-document";
import {
  getAgreementTemplates,
  getFamiliesForSelect,
  getProposalById,
} from "@/lib/db/queries";
import { formatCents } from "@/lib/agreements/schedule";
import { proposalLinkUrl } from "@/lib/proposals/links";
import { parentFullName, studentFullName } from "@/lib/proposals/row";
import { pastDueLines } from "@/lib/proposals/schedule";
import { conversionProblem } from "@/lib/proposals/status";
import { formatLongDate } from "@/lib/proposals/terms";
import { firmTodayIso } from "@/lib/tasks/recurrence";
import { ProposalActions, type ConversionOptions } from "./proposal-actions";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * One proposal: where it stands, what can be done next, and — rendered by
 * the same component as the public page — exactly what the client sees.
 * `getProposalById` enforces access (404 for anyone who may not open it).
 */
export default async function ProposalDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await getProposalById(id);
  if (!detail) return notFound();
  const { proposal, view, todayIso } = detail;

  const convertible =
    conversionProblem({
      status: proposal.status,
      agreement_status: proposal.agreement?.status,
    }) === null;
  // Only fetched when the hand-off to an agreement is actually on offer.
  const [templates, families] = convertible
    ? await Promise.all([getAgreementTemplates(), getFamiliesForSelect()])
    : [[], []];

  // Dates are formatted here, in the firm's calendar, so the client
  // component never re-derives them in the browser's timezone.
  const firmDate = (timestamp: string) =>
    formatLongDate(firmTodayIso(Date.parse(timestamp), detail.firmTimezone));
  const facts: { label: string; value: string }[] = [];
  if (detail.author) facts.push({ label: "Prepared by", value: detail.author.name });
  facts.push({ label: "Client email", value: proposal.parent_email });
  if (proposal.sent_at) {
    facts.push({ label: "Sent", value: firmDate(proposal.sent_at) });
  }
  facts.push({
    label: "Valid through",
    value:
      formatLongDate(proposal.valid_until) +
      (detail.displayStatus === "expired" ? " — expired" : ""),
  });
  if (proposal.approved_at && proposal.approved_by_name) {
    facts.push({
      label: "Approved",
      value:
        proposal.approved_via === "staff"
          ? `Recorded by ${proposal.approved_by_name} on ${firmDate(proposal.approved_at)}`
          : `Online by ${proposal.approved_by_name} on ${firmDate(proposal.approved_at)}`,
    });
  }
  if (proposal.status === "withdrawn" && proposal.withdrawn_at) {
    facts.push({ label: "Withdrawn", value: firmDate(proposal.withdrawn_at) });
  }

  const conversion: ConversionOptions | null = convertible
    ? {
        templates: templates.map((t) => ({ id: t.id, name: t.name })),
        families,
        canCreateFamily: detail.canCreateFamily,
        defaultHouseholdName: `${proposal.parent_last_name} Family`,
        priceSummary: `${formatCents(proposal.discounted_cost_cents)} in ${
          view.lines.length
        } payment${view.lines.length === 1 ? "" : "s"}`,
        pastDueNotes: pastDueLines(view.lines, todayIso).map(
          (line) => `${line.label} — ${formatLongDate(line.dueOn as string)}`
        ),
      }
    : null;

  return (
    <PageShell
      title={proposal.title}
      description={`For ${parentFullName(proposal)} · ${studentFullName(
        proposal
      )}, Class of ${proposal.graduation_year}`}
      actions={
        <Link
          href="/proposals"
          className="text-sm font-medium text-primary-700 hover:text-primary-800"
        >
          All proposals
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:order-2 lg:col-span-1">
          <div className="lg:sticky lg:top-6">
            <ProposalActions
              proposalId={proposal.id}
              status={proposal.status}
              displayStatus={detail.displayStatus}
              parentEmail={proposal.parent_email}
              publicUrl={
                proposal.public_token ? proposalLinkUrl(proposal.public_token) : null
              }
              facts={facts}
              agreement={
                proposal.agreement
                  ? {
                      status: proposal.agreement.status,
                      familyId: proposal.agreement.family_id,
                    }
                  : null
              }
              family={detail.family}
              conversion={conversion}
            />
          </div>
        </div>
        <section className="lg:order-1 lg:col-span-2" aria-label="Proposal preview">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
            {proposal.status === "draft"
              ? "Preview — what the client will see"
              : "What the client sees"}
          </p>
          <ProposalDocument view={view} />
        </section>
      </div>
    </PageShell>
  );
}
