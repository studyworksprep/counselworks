import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { getFamilyByIdCached } from "@/lib/db/queries";
import type { FamilyStudentSummary } from "@/lib/db/queries";
import {
  STUDENT_STATUS_BADGES,
  STUDENT_STATUS_LABELS,
} from "@/lib/constants/students";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { AddMemberForm } from "./add-member-form";
import { MemberPortalActions } from "./member-portal-actions";
import { MakePrimaryButton } from "./make-primary-button";
import { MemberRowActions } from "./member-row-actions";
import { NotesCard } from "@/components/cards/notes-card";

interface Props {
  params: Promise<{ id: string }>;
}

interface MemberRow {
  id: string;
  relationship_type: string;
  is_primary_contact: boolean;
  users: { first_name: string; last_name: string; email: string };
  portal_status: "active" | "pending" | "none";
  pending_invitation: { id: string; email: string; sent_at: string } | null;
}

/**
 * Family Overview (fix plan 13.0): who is in the household and their
 * portal state, the students, the address, and the counselor's notes.
 * Agreements and invoices live on Billing; per-student work (tasks,
 * documents, meetings) on its own sub-page.
 */
export default async function FamilyOverviewPage({ params }: Props) {
  const { id } = await params;
  const [family, ctx] = await Promise.all([
    getFamilyByIdCached(id),
    resolveUserAndFirm(),
  ]);
  if (!family) return notFound();

  const permissionCtx = ctx
    ? { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] }
    : null;
  const canInvite =
    !!permissionCtx && hasPermission(permissionCtx, "manage_clients");
  // Deactivating members is roster lifecycle — owner/admin only (7.5).
  const canDeactivate =
    !!permissionCtx && hasPermission(permissionCtx, "manage_staff");
  const members = family.members as MemberRow[];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Family Members</h3>
              <AddMemberForm familyId={id} />
            </div>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-sm text-gray-500">
                No family members linked. Add parents, guardians, or students
                to this household.
              </p>
            ) : (
              <ul className="space-y-3">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3">
                    <Avatar
                      firstName={m.users.first_name}
                      lastName={m.users.last_name}
                      size="sm"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {m.users.first_name} {m.users.last_name}
                        {m.is_primary_contact ? (
                          <Badge variant="success" className="ml-2">
                            Primary
                          </Badge>
                        ) : (
                          ["parent", "guardian"].includes(m.relationship_type) && (
                            <span className="ml-2">
                              <MakePrimaryButton familyMemberId={m.id} />
                            </span>
                          )
                        )}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {m.relationship_type.replace(/_/g, " ")} &middot;{" "}
                        {m.users.email}
                      </p>
                    </div>
                    {["parent", "guardian"].includes(m.relationship_type) && (
                      <MemberPortalActions
                        familyMemberId={m.id}
                        memberName={m.users.first_name}
                        memberEmail={m.users.email}
                        portalStatus={m.portal_status}
                        pendingInvitation={m.pending_invitation}
                        canInvite={canInvite}
                      />
                    )}
                    <MemberRowActions
                      member={{
                        id: m.id,
                        first_name: m.users.first_name,
                        last_name: m.users.last_name,
                        relationship_type: m.relationship_type,
                        portal_status: m.portal_status,
                      }}
                      canDeactivate={canDeactivate}
                    />
                  </li>
                ))}
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
              <p className="text-sm text-gray-500">No students in this household.</p>
            ) : (
              <ul className="space-y-3">
                {family.students.map((s: FamilyStudentSummary) => (
                  <li key={s.id}>
                    <Link
                      href={`/students/${s.id}`}
                      className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-gray-50"
                    >
                      <Avatar firstName={s.first_name} lastName={s.last_name} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {s.first_name} {s.last_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          Class of {s.graduation_year} &middot;{" "}
                          <Badge variant={STUDENT_STATUS_BADGES[s.status] ?? "default"}>
                            {STUDENT_STATUS_LABELS[s.status] ?? s.status}
                          </Badge>
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <NotesCard notes={family.recentNotes} familyId={family.id} />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Contact Information</h3>
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
                  {family.country && <p className="text-gray-600">{family.country}</p>}
                </>
              ) : (
                <p className="text-gray-500">No address on file.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
