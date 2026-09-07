import { notFound } from "next/navigation";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { importTemplateCsv } from "@/lib/import/csv";
import { ImportClient } from "./import-client";

/**
 * CSV bulk import (fix plan 13.4). Owner/admin only — the same intake gate
 * as /students/new and /families/new; runClientImport enforces it too.
 */
export default async function ImportClientsPage() {
  const ctx = await resolveUserAndFirm();
  const canCreate =
    !!ctx &&
    hasPermission(
      { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] },
      "manage_staff"
    );
  if (!canCreate) return notFound();

  return <ImportClient template={importTemplateCsv()} />;
}
