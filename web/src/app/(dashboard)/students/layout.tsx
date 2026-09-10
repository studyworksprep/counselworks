import { getStudentRail } from "@/lib/db/queries";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { readLayoutPrefs } from "@/lib/ui/layout-prefs.server";
import { StudentRail } from "./student-rail";

/**
 * Students area (fix plan 13.0): the class-year rail is the way to find
 * and switch students — on the roster and inside every student's
 * workspace alike — with search and Add student built in. It collapses to
 * a slim strip (remembered per browser) so a counselor can share a screen
 * without showing the rest of their roster.
 */
export default async function StudentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [students, ctx, prefs] = await Promise.all([
    getStudentRail(),
    resolveUserAndFirm(),
    readLayoutPrefs(),
  ]);
  // Client intake (creation) is owner/admin-only — the same gate as the
  // roster's Add Student button (requireClientIntake).
  const canCreate =
    !!ctx &&
    hasPermission(
      { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] },
      "manage_staff"
    );

  return (
    <div className="@container/workspace flex min-h-screen">
      <StudentRail
        students={students}
        canCreate={canCreate}
        initialCollapsed={prefs.studentRailCollapsed}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
