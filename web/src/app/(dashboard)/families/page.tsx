import { getFamilies } from "@/lib/db/queries";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { FamiliesClient } from "./families-client";

interface Props {
  searchParams: Promise<{ search?: string }>;
}

export default async function FamiliesPage({ searchParams }: Props) {
  const params = await searchParams;
  const [families, ctx] = await Promise.all([
    getFamilies({ search: params.search }),
    resolveUserAndFirm(),
  ]);

  // Client intake (creation) is owner/admin-only — see requireClientIntake.
  const canCreate =
    !!ctx &&
    hasPermission(
      {
        userId: ctx.userId,
        firmId: ctx.firmId,
        role: ctx.role,
        assignedStudentIds: [],
      },
      "manage_staff"
    );

  return <FamiliesClient families={families} canCreate={canCreate} />;
}
