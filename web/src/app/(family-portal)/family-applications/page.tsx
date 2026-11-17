import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ApplicationsIcon } from "@/components/icons";
import { ApplicationCard } from "@/components/applications/application-card";
import {
  getParentApplications,
  getParentAidComparison,
} from "@/lib/db/queries";
import { NetCostComparison } from "@/components/aid/net-cost-comparison";

export default async function FamilyApplicationsPage() {
  const [applications, aidByStudent] = await Promise.all([
    getParentApplications(),
    getParentAidComparison(),
  ]);

  if (!applications) redirect("/sign-in");

  // Group applications by student name
  const grouped = new Map<string, typeof applications>();
  for (const app of applications) {
    const name = app.student_name || "Unknown Student";
    if (!grouped.has(name)) {
      grouped.set(name, []);
    }
    grouped.get(name)!.push(app);
  }

  return (
    <PageShell
      title="Family Applications"
      description="Track college applications across all your children"
    >
      {applications.length === 0 ? (
        <Card className="max-w-3xl">
          <EmptyState
            icon={<ApplicationsIcon className="h-5 w-5" />}
            title="No applications yet"
            description="Your counselor will help build college lists."
            actionLabel="View college lists"
            actionHref="/family-colleges"
          />
        </Card>
      ) : (
        <div className="space-y-10">
          {aidByStudent.map(
            (group) =>
              group.rows.some((r) => r.awards.length > 0 || r.cost_of_attendance != null) && (
                <NetCostComparison
                  key={group.student_name}
                  rows={group.rows}
                  title={
                    aidByStudent.length > 1
                      ? `Net Cost Comparison — ${group.student_name}`
                      : "Net Cost Comparison"
                  }
                />
              )
          )}
          {Array.from(grouped.entries()).map(([studentName, apps]) => (
            <section key={studentName} aria-label={`${studentName} applications`}>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                {studentName}
              </h2>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {apps.map((app) => (
                  <ApplicationCard key={app.id} app={app} surface="family" />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
