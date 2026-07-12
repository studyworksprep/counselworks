import { getStudents, getWorkflowTemplates } from "@/lib/db/queries";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { StudentsClient } from "./students-client";

interface Props {
  searchParams: Promise<{ search?: string; status?: string; year?: string }>;
}

export default async function StudentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const [students, ctx, templates] = await Promise.all([
    getStudents({
      search: params.search,
      status: params.status,
      graduationYear: params.year,
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
      students={students}
      canCreate={canCreate}
      workflowTemplates={templates
        .filter((t) => t.instantiation_scope === "student")
        .map((t) => ({ id: t.id, name: t.name }))}
    />
  );
}
