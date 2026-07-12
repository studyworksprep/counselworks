import { notFound } from "next/navigation";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { NewFamilyForm } from "./new-family-form";

// Client intake is owner/admin-only (see requireClientIntake): a scoped
// counselor who created a family could never assign it to themselves, so the
// record would vanish from their roster. createFamily enforces this too —
// this gate just keeps the dead-end form unreachable.
export default async function NewFamilyPage() {
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

  return <NewFamilyForm />;
}
