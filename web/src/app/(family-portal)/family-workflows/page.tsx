import { PageShell } from "@/components/layout/page-shell";
import { WorkflowProgressList } from "@/components/cards/workflow-progress";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkflowsIcon } from "@/components/icons";
import { getFamilyWorkflows } from "@/lib/db/queries";

export default async function FamilyWorkflowsPage() {
  const groups = await getFamilyWorkflows();
  const anyPlans = groups.some((group) => group.workflows.length > 0);

  return (
    <PageShell
      title="Workflows"
      description="Progress on the plans your counselor has set up"
    >
      {!anyPlans ? (
        <Card className="max-w-4xl">
          <EmptyState
            icon={<WorkflowsIcon className="h-5 w-5" />}
            title="No plan shared yet"
            description="No workflows are currently shared with your family."
            actionLabel="Ask your counselor about a plan"
            actionHref="/family-messages"
          />
        </Card>
      ) : (
        <div className="space-y-10">
          {groups.map(({ student, workflows }) => (
            <section key={student.id} aria-labelledby={`plans-${student.id}`}>
              <h2
                id={`plans-${student.id}`}
                className="mb-4 text-lg font-semibold text-gray-900"
              >
                {student.first_name} {student.last_name}
              </h2>
              <WorkflowProgressList
                workflows={workflows}
                surface="family"
                emptyText={`No plans are shared for ${student.first_name} yet.`}
              />
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
