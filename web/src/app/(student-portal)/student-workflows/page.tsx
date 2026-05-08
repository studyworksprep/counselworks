import { PageShell } from "@/components/layout/page-shell";
import { WorkflowProgressList } from "@/components/cards/workflow-progress";
import { getMyWorkflows } from "@/lib/db/queries";

export default async function StudentWorkflowsPage() {
  const workflows = await getMyWorkflows();

  return (
    <PageShell
      title="My Workflows"
      description="Plans your counselor has set up to guide you through the process"
    >
      <WorkflowProgressList
        workflows={workflows}
        emptyText="Your counselor hasn't set up any workflows for you yet."
      />
    </PageShell>
  );
}
