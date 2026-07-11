import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { getFamilyById, getFamilyMeetings } from "@/lib/db/queries";
import { formatDate } from "@/lib/utils";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { AddMemberForm } from "./add-member-form";
import { EditFamilyForm } from "./edit-family-form";
import { MemberPortalActions } from "./member-portal-actions";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FamilyDetailPage({ params }: Props) {
  const { id } = await params;
  const [family, ctx] = await Promise.all([
    getFamilyById(id),
    resolveUserAndFirm(),
  ]);

  if (!family) return notFound();

  const canInvite =
    !!ctx &&
    hasPermission(
      {
        userId: ctx.userId,
        firmId: ctx.firmId,
        role: ctx.role,
        assignedStudentIds: [],
      },
      "manage_clients"
    );

  const meetings = await getFamilyMeetings(id);

  const editData = {
    id: family.id,
    household_name: family.household_name,
    address_line1: family.address_line1 ?? null,
    address_line2: family.address_line2 ?? null,
    city: family.city ?? null,
    state_region: family.state_region ?? null,
    postal_code: family.postal_code ?? null,
    country: family.country ?? null,
  };

  return (
    <PageShell
      title={family.household_name}
      description="Family household"
      actions={<EditFamilyForm family={editData} />}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Family Members</h3>
                <AddMemberForm familyId={id} />
              </div>
            </CardHeader>
            <CardContent>
              {family.members.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No family members linked. Add parents, guardians, or students
                  to this household.
                </p>
              ) : (
                <ul className="space-y-3">
                  {family.members.map(
                    (m: {
                      id: string;
                      relationship_type: string;
                      is_primary_contact: boolean;
                      users: {
                        first_name: string;
                        last_name: string;
                        email: string;
                      };
                      portal_status: "active" | "pending" | "none";
                      pending_invitation: {
                        id: string;
                        email: string;
                        sent_at: string;
                      } | null;
                    }) => (
                      <li key={m.id} className="flex items-center gap-3">
                        <Avatar
                          firstName={m.users.first_name}
                          lastName={m.users.last_name}
                          size="sm"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {m.users.first_name} {m.users.last_name}
                            {m.is_primary_contact && (
                              <Badge variant="success" className="ml-2">
                                Primary
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 capitalize">
                            {m.relationship_type.replace(/_/g, " ")} &middot;{" "}
                            {m.users.email}
                          </p>
                        </div>
                        {["parent", "guardian"].includes(
                          m.relationship_type
                        ) && (
                          <MemberPortalActions
                            familyMemberId={m.id}
                            memberName={m.users.first_name}
                            memberEmail={m.users.email}
                            portalStatus={m.portal_status}
                            pendingInvitation={m.pending_invitation}
                            canInvite={canInvite}
                          />
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
              <h3 className="font-semibold text-gray-900">Students</h3>
            </CardHeader>
            <CardContent>
              {family.students.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No students in this household.
                </p>
              ) : (
                <ul className="space-y-3">
                  {family.students.map(
                    (s: {
                      id: string;
                      first_name: string;
                      last_name: string;
                      graduation_year: number;
                      status: string;
                    }) => (
                      <li key={s.id}>
                        <Link
                          href={`/students/${s.id}`}
                          className="flex items-center gap-3 rounded-lg p-2 hover:bg-gray-50 cursor-pointer"
                        >
                          <Avatar
                            firstName={s.first_name}
                            lastName={s.last_name}
                            size="sm"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {s.first_name} {s.last_name}
                            </p>
                            <p className="text-xs text-gray-500">
                              Class of {s.graduation_year} &middot;{" "}
                              <Badge
                                variant={
                                  s.status === "active" ? "success" : "default"
                                }
                              >
                                {s.status}
                              </Badge>
                            </p>
                          </div>
                        </Link>
                      </li>
                    )
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Meetings Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Upcoming Meetings</h3>
                <Link
                  href="/calendar"
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  View Calendar
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {meetings.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No upcoming meetings for this family.
                </p>
              ) : (
                <ul className="space-y-3">
                  {meetings.map(
                    (m: {
                      id: string;
                      title: string;
                      meeting_type: string;
                      scheduled_start_at: string | null;
                      location_text: string | null;
                      student_name: string | null;
                    }) => (
                      <li
                        key={m.id}
                        className="flex items-start justify-between border-b border-gray-100 pb-2 last:border-0"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {m.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="default">
                              {m.meeting_type.replace(/_/g, " ")}
                            </Badge>
                            {m.student_name && (
                              <span className="text-xs text-gray-400">
                                {m.student_name}
                              </span>
                            )}
                          </div>
                          {m.location_text && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {m.location_text}
                            </p>
                          )}
                        </div>
                        {m.scheduled_start_at && (
                          <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                            {formatDate(m.scheduled_start_at)}
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
              <h3 className="font-semibold text-gray-900">Notes</h3>
            </CardHeader>
            <CardContent>
              {family.recentNotes.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No notes for this family.
                </p>
              ) : (
                <ul className="space-y-3">
                  {family.recentNotes.map(
                    (note: {
                      id: string;
                      title: string | null;
                      body: string;
                      created_at: string;
                    }) => (
                      <li
                        key={note.id}
                        className="border-b border-gray-100 pb-2 last:border-0"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {note.title || "Untitled"}
                        </p>
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {note.body}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDate(note.created_at)}
                        </p>
                      </li>
                    )
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">
                Contact Information
              </h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {family.address_line1 ? (
                  <>
                    <p className="text-gray-900">{family.address_line1}</p>
                    {family.address_line2 && (
                      <p className="text-gray-900">{family.address_line2}</p>
                    )}
                    <p className="text-gray-600">
                      {[family.city, family.state_region, family.postal_code]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    {family.country && (
                      <p className="text-gray-600">{family.country}</p>
                    )}
                  </>
                ) : (
                  <p className="text-gray-500">No address on file.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Documents</h3>
            </CardHeader>
            <CardContent>
              {family.recentDocuments.length === 0 ? (
                <p className="text-sm text-gray-500">No documents uploaded.</p>
              ) : (
                <ul className="space-y-2">
                  {family.recentDocuments.map(
                    (doc: {
                      id: string;
                      title: string;
                      category: string;
                      created_at: string;
                    }) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {doc.title}
                          </p>
                          <p className="text-xs text-gray-500">{doc.category}</p>
                        </div>
                        <span className="text-xs text-gray-400">
                          {formatDate(doc.created_at)}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
