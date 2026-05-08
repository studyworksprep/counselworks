import { PageShell } from "@/components/layout/page-shell";
import { WorkflowProgressList } from "@/components/cards/workflow-progress";
import { getFamilyWorkflows } from "@/lib/db/queries";

export default async function FamilyWorkflowsPage() {
  const groups = await getFamilyWorkflows();

  return (
    <PageShell
      title="Workflows"
      description="Progress on the plans your counselor has set up"
    >
      {groups.length === 0 ? (
        <p className="text-sm text-gray-500">
          No workflows are currently shared with your family.
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map(({ student, workflows }) => (
            <section key={student.id}>
              <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
                {student.first_name} {student.last_name}
              </h2>
              <WorkflowProgressList workflows={workflows} />
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
