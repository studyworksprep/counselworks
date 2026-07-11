import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/cards/stat-card";
import { WorkflowProgressList } from "@/components/cards/workflow-progress";
import {
  getStudentById,
  getStudentMeetings,
  getStudentWorkflows,
  getStaffForSelect,
  getStudentInvitation,
} from "@/lib/db/queries";
import { getDb } from "@/lib/db/client";
import { formatDate } from "@/lib/utils";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { EditStudentForm } from "./edit-student-form";
import { StaffAssignmentsCard } from "./staff-assignments-card";
import { PortalInviteCard } from "./portal-invite-card";
import { NotesCard } from "@/components/cards/notes-card";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StudentDetailPage({ params }: Props) {
  const { id } = await params;
  const student = await getStudentById(id);

  if (!student) return notFound();

  const [meetings, workflows, staff, ctx, invitation] = await Promise.all([
    getStudentMeetings(id),
    getStudentWorkflows(id),
    getStaffForSelect(),
    resolveUserAndFirm(),
    getStudentInvitation(id),
  ]);

  const permissionCtx = ctx
    ? {
        userId: ctx.userId,
        firmId: ctx.firmId,
        role: ctx.role,
        assignedStudentIds: [],
      }
    : null;
  // Staff assignments are an admin action; portal invites are a client-
  // management action every counselor has for their own students.
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

  const profile = Array.isArray(student.student_profiles)
    ? student.student_profiles[0]
    : student.student_profiles;
  const familyName =
    (student.families as { household_name?: string } | null)?.household_name ??
    "—";

  const overdueCount = student.upcomingTasks.filter(
    (t: { due_at: string | null; status: string }) =>
      t.due_at && new Date(t.due_at) < new Date() && t.status !== "completed"
  ).length;

  const editData = {
    id: student.id,
    first_name: student.first_name,
    last_name: student.last_name,
    graduation_year: student.graduation_year,
    school_name: student.school_name,
    school_type: student.school_type ?? null,
    status: student.status,
    preferred_name: student.preferred_name ?? null,
    academic_interests: student.academic_interests ?? null,
    extracurricular_summary: student.extracurricular_summary ?? null,
    gpa_unweighted: student.gpa_unweighted,
    gpa_weighted: student.gpa_weighted,
    class_rank: student.class_rank ?? null,
    profile: profile
      ? {
          citizenship_status: profile.citizenship_status ?? null,
          budget_range: profile.budget_range ?? null,
          financial_aid_interest: profile.financial_aid_interest ?? null,
        }
      : null,
  };

  return (
    <PageShell
      title={`${student.first_name} ${student.last_name}`}
      description={`Class of ${student.graduation_year} · ${student.school_name ?? "No school"} · ${familyName}`}
      actions={<EditStudentForm student={editData} />}
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
        <StatCard title="Status" value={student.status} />
        <StatCard title="Overdue Tasks" value={overdueCount} />
        <StatCard title="Applications" value={student.applications.length} />
        <StatCard title="GPA (UW)" value={student.gpa_unweighted ?? "—"} />
        <StatCard title="GPA (W)" value={student.gpa_weighted ?? "—"} />
      </div>

      {/* College List Link */}
      <div className="mb-8">
        <Link
          href={`/students/${id}/colleges`}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          View College List
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column */}
        <div className="lg:col-span-3 space-y-6">
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
                      priority: string;
                      status: string;
                    }) => (
                      <li
                        key={task.id}
                        className="flex items-start justify-between text-sm"
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {task.title}
                          </p>
                          <Badge
                            variant={
                              task.priority === "urgent"
                                ? "danger"
                                : task.priority === "high"
                                  ? "warning"
                                  : "default"
                            }
                          >
                            {task.priority}
                          </Badge>
                        </div>
                        {task.due_at && (
                          <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                            {formatDate(task.due_at)}
                          </span>
                        )}
                      </li>
                    )
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          <NotesCard notes={student.recentNotes} studentId={student.id} />
        </div>

        {/* Center Column */}
        <div className="lg:col-span-6 space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Applications</h3>
            </CardHeader>
            <CardContent>
              {student.applications.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No applications yet. Add colleges to the student&apos;s list
                  to begin tracking applications.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left">
                        <th className="pb-2 font-medium text-gray-500">
                          College
                        </th>
                        <th className="pb-2 font-medium text-gray-500">
                          Stage
                        </th>
                        <th className="pb-2 font-medium text-gray-500">
                          Deadline
                        </th>
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
                          <tr
                            key={app.id}
                            className="border-b border-gray-100"
                          >
                            <td className="py-2 font-medium text-gray-900">
                              {(app.colleges as { name: string } | null)
                                ?.name ?? "Unknown"}
                            </td>
                            <td className="py-2">
                              <Badge variant="default">
                                {app.stage.replace(/_/g, " ")}
                              </Badge>
                            </td>
                            <td className="py-2 text-gray-500">
                              {app.deadline_at
                                ? formatDate(app.deadline_at)
                                : "—"}
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
        </div>

        {/* Right Column */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Academic Snapshot</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">GPA (UW)</span>
                  <span className="font-medium">
                    {student.gpa_unweighted ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">GPA (W)</span>
                  <span className="font-medium">
                    {student.gpa_weighted ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Class Rank</span>
                  <span className="font-medium">
                    {student.class_rank ?? "—"}
                  </span>
                </div>
                {student.school_type && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">School Type</span>
                    <span className="font-medium">{student.school_type}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

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
            <CardContent>
              <p className="text-sm text-gray-900 font-medium">{familyName}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Workflows Section */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Workflows</h3>
              <Link
                href="/workflows"
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                Browse templates
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <WorkflowProgressList
              workflows={workflows}
              emptyText="No workflows assigned. Apply a template from the Workflows page."
              showAssignee
            />
          </CardContent>
        </Card>
      </div>

      {/* Meetings Section */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Upcoming Meetings</h3>
              <Link
                href={`/calendar`}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                View Calendar
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {meetings.length === 0 ? (
              <p className="text-sm text-gray-500">No upcoming meetings scheduled.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="pb-2 font-medium text-gray-500">Meeting</th>
                      <th className="pb-2 font-medium text-gray-500">Type</th>
                      <th className="pb-2 font-medium text-gray-500">Date &amp; Time</th>
                      <th className="pb-2 font-medium text-gray-500">Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meetings.map((m: {
                      id: string;
                      title: string;
                      meeting_type: string;
                      scheduled_start_at: string | null;
                      location_text: string | null;
                    }) => (
                      <tr key={m.id} className="border-b border-gray-100">
                        <td className="py-2 font-medium text-gray-900">{m.title}</td>
                        <td className="py-2">
                          <Badge variant="default">
                            {m.meeting_type.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="py-2 text-gray-500">
                          {m.scheduled_start_at ? formatDate(m.scheduled_start_at) : "—"}
                        </td>
                        <td className="py-2 text-gray-500">{m.location_text ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
