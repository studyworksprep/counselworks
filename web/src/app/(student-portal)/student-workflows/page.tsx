import { PageShell } from "@/components/layout/page-shell";
import { WorkflowProgressList } from "@/components/cards/workflow-progress";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkflowsIcon } from "@/components/icons";
import { getMyWorkflows } from "@/lib/db/queries";

export default async function StudentWorkflowsPage() {
  const workflows = await getMyWorkflows();

  return (
    <PageShell
      title="My Workflows"
      description="Plans your counselor has set up to guide you through the process"
    >
      {workflows.length === 0 ? (
        <Card className="max-w-4xl">
          <EmptyState
            icon={<WorkflowsIcon className="h-5 w-5" />}
            title="No plan yet"
            description="Your counselor hasn't set up any workflows for you yet."
            actionLabel="Ask your counselor about a plan"
            actionHref="/student-messages"
          />
        </Card>
      ) : (
        <WorkflowProgressList
          workflows={workflows}
          surface="student"
          headingLevel="h2"
        />
      )}
    </PageShell>
  );
}
