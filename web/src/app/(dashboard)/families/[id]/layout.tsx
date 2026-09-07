import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { getFamilyByIdCached, getFamilyRail } from "@/lib/db/queries";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { EditFamilyForm } from "./edit-family-form";
import { FamilySubnav } from "./family-subnav";
import { FamilySwitcher } from "./family-switcher";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

/**
 * Family workspace (fix plan 13.0): one header + sub-navigation for every
 * per-household page (Overview, Billing, Tasks, Documents, Meetings). The
 * household rail beside it comes from the parent families layout.
 * Sub-pages render only their content; this layout owns the chrome.
 */
export default async function FamilyWorkspaceLayout({ params, children }: Props) {
  const { id } = await params;
  const [family, ctx, rail] = await Promise.all([
    getFamilyByIdCached(id),
    resolveUserAndFirm(),
    getFamilyRail(), // request-deduplicated with the families layout's rail
  ]);
  if (!family) return notFound();

  const permissionCtx = ctx
    ? { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] }
    : null;
  // Archiving and adding students are roster lifecycle — owner/admin only,
  // like creation (7.1/7.5).
  const canManageStaff =
    !!permissionCtx && hasPermission(permissionCtx, "manage_staff");

  const editData = {
    id: family.id,
    household_name: family.household_name,
    address_line1: family.address_line1 ?? null,
    address_line2: family.address_line2 ?? null,
    city: family.city ?? null,
    state_region: family.state_region ?? null,
    postal_code: family.postal_code ?? null,
    country: family.country ?? null,
    archived_at: family.archived_at ?? null,
  };

  const studentCount = family.students.length;
  const location = [family.city, family.state_region].filter(Boolean).join(", ");

  return (
    <>
      <Header
        title={family.household_name}
        description={[
          `${studentCount} student${studentCount === 1 ? "" : "s"}`,
          location || "No address on file",
        ].join(" · ")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FamilySwitcher families={rail} currentId={id} />
            {family.archived_at && <Badge variant="default">Archived</Badge>}
            {canManageStaff && (
              <Link
                href={`/students/new?family_id=${family.id}`}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Add Student
              </Link>
            )}
            <EditFamilyForm family={editData} canArchive={canManageStaff} />
          </div>
        }
      />
      <FamilySubnav familyId={id} />
      <main className="p-4 sm:p-8">{children}</main>
    </>
  );
}
