import { getFamilyRail } from "@/lib/db/queries";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { readLayoutPrefs } from "@/lib/ui/layout-prefs.server";
import { FamilyRail } from "./family-rail";

/**
 * Families area (fix plan 13.0): the household rail is the way to find and
 * switch families — on the roster and inside every family's workspace
 * alike — with search and Add family built in. It collapses to a slim
 * strip (remembered per browser), like the student rail.
 */
export default async function FamiliesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [families, ctx, prefs] = await Promise.all([
    getFamilyRail(),
    resolveUserAndFirm(),
    readLayoutPrefs(),
  ]);
  // Client intake (creation) is owner/admin-only — the same gate as the
  // roster's Add Family button (requireClientIntake).
  const canCreate =
    !!ctx &&
    hasPermission(
      { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] },
      "manage_staff"
    );

  return (
    <div className="@container/workspace flex min-h-screen">
      <FamilyRail
        families={families}
        canCreate={canCreate}
        initialCollapsed={prefs.familyRailCollapsed}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
