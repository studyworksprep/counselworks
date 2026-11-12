import { notFound } from "next/navigation";
import { getProposalFormContext } from "@/lib/db/queries";
import { graduationYearOptions } from "@/lib/proposals/input";
import { newProposalFormValues } from "@/lib/proposals/form";
import { ProposalForm } from "../proposal-form";

/**
 * New proposal. Client-management staff only (`getProposalFormContext`
 * returns null otherwise; saveProposal enforces the same rule).
 */
export default async function NewProposalPage() {
  const context = await getProposalFormContext();
  if (!context) return notFound();

  return (
    <ProposalForm
      mode="create"
      initialValues={newProposalFormValues(context.todayIso)}
      todayIso={context.todayIso}
      graduationYears={graduationYearOptions(context.todayIso)}
    />
  );
}
