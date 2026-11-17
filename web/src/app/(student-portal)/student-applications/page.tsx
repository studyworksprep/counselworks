import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ApplicationsIcon } from "@/components/icons";
import { ApplicationCard } from "@/components/applications/application-card";
import { getStudentApplications } from "@/lib/db/queries";
import { formatCalendarDate } from "@/lib/utils";

const SUBMITTED_STAGES = new Set(["submitted", "under_review", "decision_received"]);

export default async function StudentApplicationsPage() {
  const applications = await getStudentApplications();

  if (!applications) redirect("/sign-in");

  const today = new Date().toISOString().slice(0, 10);
  const submitted = applications.filter(
    (app) => app.submitted_at || SUBMITTED_STAGES.has(app.stage)
  ).length;
  // The next deadline still ahead of an application that isn't in yet.
  const next = applications
    .filter(
      (app) =>
        app.deadline_at &&
        app.deadline_at.slice(0, 10) >= today &&
        !app.submitted_at &&
        !SUBMITTED_STAGES.has(app.stage) &&
        app.stage !== "withdrawn"
    )
    .sort((a, b) => a.deadline_at!.localeCompare(b.deadline_at!))[0];

  return (
    <PageShell
      title="My Applications"
      description="Track the status of your college applications"
    >
      {applications.length === 0 ? (
        <Card className="max-w-3xl">
          <EmptyState
            icon={<ApplicationsIcon className="h-5 w-5" />}
            title="No applications yet"
            description="Your counselor will help you build your college list."
            actionLabel="View your college list"
            actionHref="/student-colleges"
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <dl className="grid overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:grid-cols-3">
            <div className="border-b border-gray-100 px-5 py-4 sm:border-b-0 sm:border-r">
              <dt className="text-xs font-medium text-gray-600">Applications</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">
                {applications.length}
              </dd>
            </div>
            <div className="border-b border-gray-100 px-5 py-4 sm:border-b-0 sm:border-r">
              <dt className="text-xs font-medium text-gray-600">Submitted</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums text-gray-900">
                {submitted}
              </dd>
            </div>
            <div className="px-5 py-4">
              <dt className="text-xs font-medium text-gray-600">Next deadline</dt>
              <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                {next ? (
                  <>
                    <span className="text-xl font-bold tabular-nums text-gray-900">
                      {formatCalendarDate(next.deadline_at!)}
                    </span>
                    <span className="text-sm text-gray-600">{next.college_name}</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-600">None upcoming</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {applications.map((app) => (
              <ApplicationCard key={app.id} app={app} surface="student" />
            ))}
          </div>
        </div>
      )}
    </PageShell>
  );
}
