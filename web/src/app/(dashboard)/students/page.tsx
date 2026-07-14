import { getStudents, getWorkflowTemplates } from "@/lib/db/queries";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { parseListParams } from "@/lib/list-params";
import { StudentsClient } from "./students-client";

const STUDENT_SORT_KEYS = ["name", "graduation_year", "status"] as const;

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    year?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}

export default async function StudentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { page, sort } = parseListParams(params, STUDENT_SORT_KEYS);
  const [students, ctx, templates] = await Promise.all([
    getStudents({
      search: params.search,
      status: params.status,
      graduationYear: params.year,
      page,
      sort,
    }),
    resolveUserAndFirm(),
    getWorkflowTemplates({ activeOnly: true }),
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
    <StudentsClient
      students={students.rows}
      pagination={{
        page: students.page,
        pageSize: students.pageSize,
        total: students.total,
      }}
      canCreate={canCreate}
      workflowTemplates={templates
        .filter((t) => t.instantiation_scope === "student")
        .map((t) => ({ id: t.id, name: t.name }))}
    />
  );
}
