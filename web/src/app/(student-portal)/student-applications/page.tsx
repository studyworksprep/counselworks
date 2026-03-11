import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStudentApplications } from "@/lib/db/queries";
import { formatDate, isOverdue } from "@/lib/utils";

const stageBadgeVariant: Record<string, "default" | "primary" | "success" | "warning" | "danger"> = {
  not_started: "default",
  in_progress: "primary",
  submitted: "success",
  under_review: "warning",
  decision_received: "primary",
};

const decisionBadgeVariant: Record<string, "success" | "danger" | "warning" | "default"> = {
  accepted: "success",
  rejected: "danger",
  waitlisted: "warning",
  deferred: "default",
};

export default async function StudentApplicationsPage() {
  const applications = await getStudentApplications();

  if (!applications) redirect("/sign-in");

  return (
    <PageShell
      title="My Applications"
      description="Track the status of your college applications"
    >
      {applications.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-4 text-sm text-gray-500">
              No applications yet. Your counselor will help you build your college list.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {applications.map((app) => {
            const overdue =
              app.deadline_at &&
              !app.submitted_at &&
              app.stage !== "decision_received" &&
              isOverdue(app.deadline_at);

            return (
              <Card key={app.id}>
                <CardContent>
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-gray-900">
                      {app.college_name}
                    </h3>
                    <Badge variant={stageBadgeVariant[app.stage] ?? "default"}>
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
                            overdue ? "font-medium text-danger-500" : ""
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
                            decisionBadgeVariant[app.decision_result] ?? "default"
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
      )}
    </PageShell>
  );
}
