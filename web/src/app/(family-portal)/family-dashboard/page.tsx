import { ArrowLink } from "@/components/ui/arrow-link";
import { LinkButton } from "@/components/ui/link-button";
import { QuickLinks } from "@/components/ui/quick-links";
import Link from "next/link";
import { taskPath } from "@/lib/constants/task-links";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getParentDashboardData,
  getParentTasks,
  getPortalNotesForFamily,
  getFamilyIntakeData,
  getFamilyProgressData,
  getFamilyWorkflows,
  getPortalAgreements,
  getPortalInvoices,
  getParentOpenDocumentRequests,
  getBillingTodayIso,
} from "@/lib/db/queries";
import { formatCents } from "@/lib/agreements/schedule";
import { TASK_OPEN_STATUSES } from "@/lib/constants/tasks";
import { buildAttentionItems, summarizeChildApplications, type ChildApplication } from "@/lib/family/dashboard";
import { FamilyIntakeCard } from "./family-intake-card";
import { NeedsAttention } from "./needs-attention";
import { ChildSummary } from "./child-summary";
import { formatDate, formatDateTime, isOverdue } from "@/lib/utils";

/** Upcoming meetings listed in the household card (the query reads ahead for per-child "next meeting"). */
const MEETINGS_LISTED = 5;

export default async function FamilyDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ payment?: string }>;
}) {
  const { payment } = (await searchParams) ?? {};
  const [
    data,
    notes,
    intakeChildren,
    progress,
    familyWorkflows,
    agreements,
    invoices,
    familyTasks,
    documentRequests,
    today,
  ] = await Promise.all([
    getParentDashboardData(),
    getPortalNotesForFamily(),
    getFamilyIntakeData(),
    getFamilyProgressData(),
    getFamilyWorkflows(),
    getPortalAgreements(),
    getPortalInvoices(),
    getParentTasks(),
    getParentOpenDocumentRequests(),
    getBillingTodayIso(),
  ]);

  if (!data) {
    redirect("/sign-in");
  }

  const { students, tasks, upcomingMeetings } = data;

  const attention = buildAttentionItems({
    today,
    invoices,
    agreements,
    documentRequests,
    tasks: familyTasks,
    formatDate,
    formatMoney: formatCents,
  });
  const myOpenTaskCount = familyTasks.filter(
    (task) => task.isMine && TASK_OPEN_STATUSES.includes(task.status)
  ).length;

  return (
    <PageShell
      title="Family Dashboard"
      description="Overview of your children's college counseling progress"
    >
      {/* Checkout return banners (fix plan 12.5). "Submitted" is honest:
          the invoice flips to Paid only when the verified webhook lands. */}
      {payment === "submitted" && (
        <div role="status" className="mb-6 rounded-xl bg-success-50 px-4 py-3 text-sm font-medium text-success-800">
          Payment submitted — your invoice will show as paid once the
          payment is confirmed (usually within a few seconds).
        </div>
      )}
      {payment === "canceled" && (
        <div role="status" className="mb-6 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Payment canceled — your invoice is unchanged.
        </div>
      )}

      {/* First on the page so an overdue payment or an unsigned agreement
          is above the fold on a phone (parent portal rework). */}
      <NeedsAttention items={attention.items} hiddenTaskCount={attention.hiddenTaskCount} />

      <QuickLinks
        className="mb-8"
        label="Family quick actions"
        links={[
          { href: "/family-tasks", label: `Your open work (${myOpenTaskCount})`, icon: "tasks" },
          { href: "/family-booking", label: "Book a meeting", icon: "schedule" },
          { href: "/family-billing", label: "Billing & agreements", icon: "billing" },
          { href: "/family-settings", label: "Notification preferences", icon: "settings" },
        ]}
      />

      {/* Per-child summary: replaces the household stat tiles, which
          counted "0 active applications" for a child holding a decision. */}
      <section aria-labelledby="family-children-heading">
        <h2 id="family-children-heading" className="mb-3 text-lg font-semibold text-gray-900">
          {students.length === 1 ? "Your student" : "Your students"}
        </h2>
        {students.length === 0 ? (
          <p className="text-sm text-gray-600">
            Your counselor hasn&rsquo;t linked a student to your household yet.
          </p>
        ) : (
          <div className={students.length > 1 ? "grid grid-cols-1 gap-4 xl:grid-cols-2" : undefined}>
            {students.map((child) => {
              const apps = (progress.find((p) => p.student.id === child.id)?.applications ??
                []) as unknown as ChildApplication[];
              const workflows =
                familyWorkflows.find((item) => item.student.id === child.id)?.workflows ?? [];
              const meeting = upcomingMeetings.find((m) => m.student_id === child.id) ?? null;
              return (
                <ChildSummary
                  key={child.id}
                  child={child}
                  wide={students.length === 1}
                  applications={summarizeChildApplications(apps, today)}
                  nextMeeting={meeting}
                  plan={
                    workflows.length
                      ? {
                          completed: workflows.reduce((sum, wf) => sum + wf.completed_steps, 0),
                          total: workflows.reduce((sum, wf) => sum + wf.total_steps, 0),
                        }
                      : null
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tasks */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Open Tasks
              </h2>
              <ArrowLink icon="tasks" href="/family-tasks">
                All family tasks
              </ArrowLink>
            </div>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-gray-500">
                No open tasks right now. Check back later!
              </p>
            ) : (
              <ul className="space-y-3">
                {tasks.map((task) => {
                  const overdue = task.due_at && isOverdue(task.due_at);
                  const s = task.students as
                    | { first_name: string }
                    | { first_name: string }[]
                    | null;
                  const studentName = s
                    ? Array.isArray(s)
                      ? s[0]?.first_name
                      : s.first_name
                    : null;

                  return (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 last:border-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            task.priority === "high"
                              ? "bg-danger-500"
                              : task.priority === "medium"
                                ? "bg-warning-500"
                                : "bg-gray-300"
                          }`}
                        />
                        <div>
                          <span className="text-sm text-gray-900">
                            {<Link className="hover:underline" href={taskPath(task.id, "family")}>{task.title}</Link>}
                          </span>
                          {studentName && (
                            <span className="ml-2 text-xs text-gray-500">
                              ({studentName})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {overdue && (
                          <Badge variant="danger">Overdue</Badge>
                        )}
                        {task.due_at && (
                          <span className="text-xs text-gray-500">
                            {formatDate(task.due_on || task.due_at)}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Upcoming meetings */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Upcoming Meetings
              </h2>
              {/* Self-booking (fix plan 13.1) */}
              <LinkButton size="sm" variant="outline" icon="schedule" href="/family-booking">
                Book a meeting
              </LinkButton>
            </div>
          </CardHeader>
          <CardContent>
            {upcomingMeetings.length === 0 ? (
              <p className="text-sm text-gray-500">
                No upcoming meetings scheduled.
              </p>
            ) : (
              <ul className="space-y-3">
                {upcomingMeetings.slice(0, MEETINGS_LISTED).map((meeting) => {
                  const s = meeting.students as
                    | { first_name: string }
                    | { first_name: string }[]
                    | null;
                  const studentName = s
                    ? Array.isArray(s)
                      ? s[0]?.first_name
                      : s.first_name
                    : null;

                  return (
                    <li
                      key={meeting.id}
                      className="border-b border-gray-100 pb-3 last:border-0"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {meeting.title}
                        {studentName && (
                          <span className="ml-2 text-xs font-normal text-gray-500">
                            ({studentName})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(meeting.scheduled_start_at)}
                        {meeting.location_text && (
                          <> &middot; {meeting.location_text}</>
                        )}
                      </p>
                      {(meeting.meeting_attendees ?? []).length > 0 && (
                        <p className="text-xs text-gray-500">
                          With{" "}
                          {(
                            meeting.meeting_attendees as unknown as Array<{
                              users: { first_name: string; last_name: string };
                            }>
                          )
                            .map(
                              (a) =>
                                `${a.users.first_name} ${a.users.last_name}`
                            )
                            .join(", ")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <FamilyIntakeCard childProfiles={intakeChildren} />
      <Link href="/family-interview" className="mt-6 block rounded-xl border border-primary-100 bg-primary-50 p-5 text-primary-900"><span className="font-semibold">Your parent interview</span><span className="mt-1 block text-sm">Share family priorities and your own observations, answer counselor questions, and see stories your student chooses to share.</span></Link>

      {/* Notes from the counselor (family-visible) */}
      {notes.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <h3 className="font-semibold text-gray-900">
              Notes from your counselor
            </h3>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className="border-b border-gray-100 pb-3 last:border-0"
                >
                  {note.title && (
                    <p className="text-sm font-medium text-gray-900">
                      {note.title}
                    </p>
                  )}
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {note.body}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatDate(note.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}


    </PageShell>
  );
}
