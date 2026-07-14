import { getFamilies } from "@/lib/db/queries";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { parseListParams } from "@/lib/list-params";
import { FamiliesClient } from "./families-client";

const FAMILY_SORT_KEYS = ["household_name", "city"] as const;

interface Props {
  searchParams: Promise<{
    search?: string;
    view?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}

export default async function FamiliesPage({ searchParams }: Props) {
  const params = await searchParams;
  const { page, sort } = parseListParams(params, FAMILY_SORT_KEYS);
  const [families, ctx] = await Promise.all([
    getFamilies({
      search: params.search,
      archived: params.view === "archived",
      page,
      sort,
    }),
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

  return (
    <FamiliesClient
      families={families.rows}
      pagination={{
        page: families.page,
        pageSize: families.pageSize,
        total: families.total,
      }}
      canCreate={canCreate}
    />
  );
}
