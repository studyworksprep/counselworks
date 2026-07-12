import { notFound } from "next/navigation";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { NewStudentForm } from "./new-student-form";

// Client intake is owner/admin-only (see requireClientIntake): a scoped
// counselor who created a student could never assign it to themselves, so
// the record would vanish from their roster. createStudent enforces this
// too — this gate just keeps the dead-end form unreachable.
interface Props {
  searchParams: Promise<{ family_id?: string }>;
}

export default async function NewStudentPage({ searchParams }: Props) {
  const params = await searchParams;
  const ctx = await resolveUserAndFirm();
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
  if (!canCreate) return notFound();

  return <NewStudentForm initialFamilyId={params.family_id ?? null} />;
}
