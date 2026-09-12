import { taskPriorityLabel } from "@/lib/constants/tasks";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/cards/stat-card";
import {
  getStudentByIdCached,
  getStudentMeetings,
  getStudentWorkflows,
  getStaffForSelect,
  getStudentInvitation,
  getFamilyAgreements,
  getFamilyInvoices,
} from "@/lib/db/queries";
import { getDb } from "@/lib/db/client";
import { formatCalendarDate, formatDate, formatDateTime } from "@/lib/utils";
import { formatCents } from "@/lib/agreements/schedule";
import { summarizeReceivables } from "@/lib/billing/aging";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { StaffAssignmentsCard } from "./staff-assignments-card";
import { PortalInviteCard } from "./portal-invite-card";
import { NotesCard } from "@/components/cards/notes-card";
import { StaffWorkflowList } from "./staff-workflow-list";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Student Overview (fix plan 13.0): what a counselor wants at a glance —
 * status, what's overdue or due next, open applications, workflow
 * progress, the next meeting, who's assigned, portal state, and the
 * household's engagement/billing state. Everything deeper lives on its own
 * sub-page (Profile, Colleges, Applications, Essays, Family & Billing).
 */
export default async function StudentOverviewPage({ params }: Props) {
  const { id } = await params;
  const student = await getStudentByIdCached(id);
  if (!student) return notFound();

  const [meetings, workflows, staff, ctx, invitation, agreements, invoices] =
    await Promise.all([
      getStudentMeetings(id),
      getStudentWorkflows(id),
      getStaffForSelect(),
      resolveUserAndFirm(),
      getStudentInvitation(id),
      student.family_id ? getFamilyAgreements(student.family_id) : [],
      student.family_id ? getFamilyInvoices(student.family_id) : [],
    ]);

  const permissionCtx = ctx
    ? { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] }
    : null;
  const canManageStaff =
    !!permissionCtx && hasPermission(permissionCtx, "manage_staff");
  const canManageClients =
    !!permissionCtx && hasPermission(permissionCtx, "manage_clients");

  // Email lives on the linked users row, not on students. Read it for
  // the invite modal prefill.
  let linkedEmail: string | null = null;
  if (student.user_id) {
    const db = getDb();
    const { data: linkedUser } = await db
      .from("users")
      .select("email")
      .eq("id", student.user_id)
      .single();
    linkedEmail = linkedUser?.email ?? null;
  }

  const familyName =
    (student.families as { household_name?: string } | null)?.household_name ??
    "—";
  const now = new Date();
  const overdueCount = student.upcomingTasks.filter(
    (t: { due_at: string | null; status: string }) =>
      t.due_at && new Date(t.due_at) < now && t.status !== "completed"
  ).length;
  const nextDeadline = student.applications
    .map((a: { deadline_at: string | null }) => a.deadline_at)
    .filter((d: string | null): d is string => !!d && new Date(d) >= now)
    .sort()[0];

  const today = new Date().toISOString().slice(0, 10);
  const balance = summarizeReceivables(invoices, today);
  const latestAgreement = agreements[0] ?? null;
  const agreementLine = !latestAgreement
    ? "No agreement sent"
    : latestAgreement.status === "completed"
      ? "Agreement executed"
      : latestAgreement.status === "voided"
        ? "Agreement voided"
        : "Agreement awaiting signature";

  return (
    <>
      <div className="mb-8 grid auto-rows-fr grid-cols-1 gap-4 @min-[28rem]/student-body:grid-cols-2 @min-[64rem]/student-body:grid-cols-4">
        <StatCard
          title="Overdue tasks"
          value={overdueCount}
          className={overdueCount > 0 ? "border-danger-200" : undefined}
        />
        <StatCard
          title="Applications"
          value={student.applications.length}
          href={`/students/${id}/applications`}
        />
        <StatCard
          title="Next deadline"
          value={nextDeadline ? formatDate(nextDeadline) : "—"}
        />
        <StatCard
          title="Balance due"
          value={invoices.length > 0 ? formatCents(balance.open_cents) : "—"}
          subtitle={
            balance.overdue_cents > 0
              ? `${formatCents(balance.overdue_cents)} overdue`
              : agreementLine
          }
          href={`/students/${id}/family`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 @min-[56rem]/student-body:grid-cols-2 @min-[80rem]/student-body:grid-cols-12">
        {/* Left: what needs doing */}
        <div className="min-w-0 space-y-6 @min-[80rem]/student-body:col-span-4">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Upcoming Tasks</h3>
            </CardHeader>
            <CardContent>
              {student.upcomingTasks.length === 0 ? (
                <p className="text-sm text-gray-500">No upcoming tasks.</p>
              ) : (
                <ul className="space-y-3">
                  {student.upcomingTasks.map(
                    (task: {
                      id: string;
                      title: string;
                      due_at: string | null;
                      due_on?: string | null;
                      priority: string;
                      status: string;
                    }) => (
                      <li
                        key={task.id}
                        className="flex flex-wrap items-start justify-between gap-2 text-sm"
                      >
                        <div>
                          <p className="break-words font-medium text-gray-900">{task.title}</p>
                          <Badge
                            variant={
                              task.priority === "urgent"
                                ? "danger"
                                : task.priority === "high"
                                  ? "warning"
                                  : "default"
                            }
                          >
                            {taskPriorityLabel(task.priority)}
                          </Badge>
                        </div>
                        {task.due_at && (
                          <span className="ml-2 whitespace-nowrap text-xs text-gray-500">
                            {formatDate(task.due_on || task.due_at)}
                          </span>
                        )}
                      </li>
                    )
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900">Upcoming Meetings</h3>
                <Link href="/calendar" className="text-sm text-primary-600 hover:text-primary-700">
                  Calendar
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {meetings.length === 0 ? (
                <p className="text-sm text-gray-500">No upcoming meetings scheduled.</p>
              ) : (
                <ul className="space-y-3">
                  {meetings.map(
                    (m: {
                      id: string;
                      title: string;
                      meeting_type: string;
                      scheduled_start_at: string | null;
                      location_text: string | null;
                    }) => (
                      <li key={m.id} className="text-sm">
                        <p className="break-words font-medium text-gray-900">{m.title}</p>
                        <p className="text-xs text-gray-500">
                          {m.scheduled_start_at
                            ? formatDateTime(m.scheduled_start_at)
                            : "Unscheduled"}
                          {m.location_text && ` · ${m.location_text}`}
                        </p>
                      </li>
                    )
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          <NotesCard notes={student.recentNotes} studentId={student.id} />
        </div>

        {/* Center: progress */}
        <div className="min-w-0 space-y-6 @min-[80rem]/student-body:col-span-5">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900">Applications</h3>
                <Link
                  href={`/students/${id}/applications`}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  All applications
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {student.applications.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No applications yet.{" "}
                  <Link
                    href={`/students/${id}/colleges`}
                    className="text-primary-600 hover:text-primary-700"
                  >
                    Build the college list
                  </Link>{" "}
                  to begin tracking applications.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left">
                        <th className="pb-2 font-medium text-gray-500">College</th>
                        <th className="pb-2 font-medium text-gray-500">Stage</th>
                        <th className="pb-2 font-medium text-gray-500">Deadline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {student.applications.map(
                        (app: {
                          id: string;
                          stage: string;
                          deadline_at: string | null;
                          colleges: { name: string } | null;
                        }) => (
                          <tr key={app.id} className="border-b border-gray-100">
                            <td className="py-2 font-medium text-gray-900">
                              <Link
                                href={`/applications/${app.id}`}
                                className="hover:text-primary-600"
                              >
                                {(app.colleges as { name: string } | null)?.name ??
                                  "Unknown"}
                              </Link>
                            </td>
                            <td className="py-2">
                              <Badge variant="default">
                                {app.stage.replace(/_/g, " ")}
                              </Badge>
                            </td>
                            <td className="py-2 text-gray-500">
                              {app.deadline_at ? formatCalendarDate(app.deadline_at) : "—"}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900">Workflows</h3>
                <Link href="/workflows" className="text-sm text-primary-600 hover:text-primary-700">
                  Browse templates
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <StaffWorkflowList workflows={workflows} canRecover={!!permissionCtx && hasPermission(permissionCtx, "edit_task")} />
            </CardContent>
          </Card>
        </div>

        {/* Right: people & access */}
        <div className="min-w-0 space-y-6 @min-[80rem]/student-body:col-span-3">
          <StaffAssignmentsCard
            studentId={id}
            assignments={student.staffAssignments}
            staff={staff}
            canManage={canManageStaff}
          />

          <PortalInviteCard
            studentId={id}
            studentEmail={linkedEmail}
            invitation={
              invitation
                ? {
                    id: invitation.id,
                    email: invitation.email,
                    status: invitation.status as "pending" | "accepted",
                    sent_at: invitation.sent_at,
                    accepted_at: invitation.accepted_at,
                  }
                : null
            }
            canInvite={canManageClients}
          />

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Family</h3>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {student.family_id ? (
                <Link
                  href={`/families/${student.family_id}`}
                  className="font-medium text-primary-600 hover:text-primary-700"
                >
                  {familyName}
                </Link>
              ) : (
                <p className="break-words font-medium text-gray-900">{familyName}</p>
              )}
              <p className="text-gray-600">{agreementLine}</p>
              {student.family_id && (
                <Link
                  href={`/students/${id}/family`}
                  className="text-primary-600 hover:text-primary-700"
                >
                  Family &amp; billing
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
