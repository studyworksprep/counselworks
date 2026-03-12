import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getParentApplications } from "@/lib/db/queries";
import { formatDate, isOverdue } from "@/lib/utils";

const stageBadgeVariant: Record<
  string,
  "default" | "primary" | "success" | "warning" | "danger"
> = {
  not_started: "default",
  in_progress: "primary",
  submitted: "success",
  under_review: "warning",
  decision_received: "primary",
};

const decisionBadgeVariant: Record<
  string,
  "success" | "danger" | "warning" | "default"
> = {
  accepted: "success",
  rejected: "danger",
  waitlisted: "warning",
  deferred: "default",
};

export default async function FamilyApplicationsPage() {
  const applications = await getParentApplications();

  if (!applications) redirect("/sign-in");

  // Group by student
  const byStudent = new Map<string, typeof applications>();
  for (const app of applications) {
    const name = app.student_name;
    if (!byStudent.has(name)) byStudent.set(name, []);
    byStudent.get(name)!.push(app);
  }

  return (
    <PageShell
      title="Applications"
      description="College applications across all your students"
    >
      {applications.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-4 text-sm text-gray-500">
              No applications yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {Array.from(byStudent.entries()).map(([studentName, apps]) => (
            <div key={studentName}>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {studentName}
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {apps.map((app) => {
                  const overdue =
                    app.deadline_at &&
                    !app.submitted_at &&
                    app.stage !== "decision_received" &&
                    isOverdue(app.deadline_at);

                  return (
                    <Card key={app.id}>
                      <CardContent>
                        <div className="flex items-start justify-between">
                          <h4 className="font-semibold text-gray-900">
                            {app.college_name}
                          </h4>
                          <Badge
                            variant={
                              stageBadgeVariant[app.stage] ?? "default"
                            }
                          >
                            {app.stage.replace(/_/g, " ")}
                          </Badge>
                        </div>

                        <div className="mt-3 space-y-1.5 text-sm text-gray-600">
                          <div className="flex justify-between">
                            <span>Type</span>
                            <span className="font-medium capitalize">
                              {app.application_type.replace(/_/g, " ")}
                            </span>
                          </div>
                          {app.deadline_at && (
                            <div className="flex justify-between">
                              <span>Deadline</span>
                              <span
                                className={
                                  overdue
                                    ? "font-medium text-danger-500"
                                    : ""
                                }
                              >
                                {formatDate(app.deadline_at)}
                                {overdue && " (overdue)"}
                              </span>
                            </div>
                          )}
                          {app.submitted_at && (
                            <div className="flex justify-between">
                              <span>Submitted</span>
                              <span>{formatDate(app.submitted_at)}</span>
                            </div>
                          )}
                          {app.decision_result && (
                            <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center">
                              <span className="font-medium">Decision</span>
                              <Badge
                                variant={
                                  decisionBadgeVariant[
                                    app.decision_result
                                  ] ?? "default"
                                }
                              >
                                {app.decision_result}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
