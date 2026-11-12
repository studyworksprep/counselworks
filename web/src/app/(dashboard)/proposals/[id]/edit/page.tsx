import { notFound, redirect } from "next/navigation";
import { getProposalById } from "@/lib/db/queries";
import { graduationYearOptions } from "@/lib/proposals/input";
import { proposalFormValuesFromRow } from "@/lib/proposals/form";
import { proposalEditable } from "@/lib/proposals/status";
import { ProposalForm } from "../../proposal-form";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Edit a proposal that is still a draft or out with the client. Every
 * field is defaulted from the stored row (proposalFormValuesFromRow). An
 * approved, rejected, or withdrawn proposal is frozen: back to its page, where
 * Duplicate starts a new version.
 */
export default async function EditProposalPage({ params }: Props) {
  const { id } = await params;
  const detail = await getProposalById(id);
  if (!detail) return notFound();
  if (!proposalEditable(detail.proposal.status)) redirect(`/proposals/${id}`);

  // Keep the stored class year selectable even if it has aged out of the
  // offered range — the form then asks for a current one on save.
  const years = graduationYearOptions(detail.todayIso);
  const storedYear = detail.proposal.graduation_year;

  return (
    <ProposalForm
      mode="edit"
      proposalId={id}
      initialValues={proposalFormValuesFromRow(detail.proposal)}
      todayIso={detail.todayIso}
      graduationYears={
        years.includes(storedYear) ? years : [storedYear, ...years].sort((a, b) => a - b)
      }
      alreadySent={detail.proposal.status === "sent"}
    />
  );
}
