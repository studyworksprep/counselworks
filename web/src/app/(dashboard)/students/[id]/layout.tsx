import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { getStudentByIdCached } from "@/lib/db/queries";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import {
  STUDENT_STATUS_BADGES,
  STUDENT_STATUS_LABELS,
} from "@/lib/constants/students";
import { EditStudentForm } from "./edit-student-form";
import { StudentSubnav } from "./student-subnav";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

/**
 * Student workspace (fix plan 13.0): one header + sub-navigation for every
 * per-student page. The class-year rail beside it comes from the parent
 * students layout (it is also the roster's switcher). Sub-pages render
 * only their content; this layout owns the chrome.
 */
export default async function StudentWorkspaceLayout({ params, children }: Props) {
  const { id } = await params;
  const [student, ctx] = await Promise.all([
    getStudentByIdCached(id),
    resolveUserAndFirm(),
  ]);
  if (!student) return notFound();

  const permissionCtx = ctx
    ? { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] }
    : null;
  const canManageStaff =
    !!permissionCtx && hasPermission(permissionCtx, "manage_staff");

  const profile = Array.isArray(student.student_profiles)
    ? student.student_profiles[0]
    : student.student_profiles;
  const familyName =
    (student.families as { household_name?: string } | null)?.household_name ??
    null;

  const editData = {
    id: student.id,
    first_name: student.first_name,
    last_name: student.last_name,
    graduation_year: student.graduation_year,
    school_name: student.school_name,
    school_type: student.school_type ?? null,
    status: student.status,
    preferred_name: student.preferred_name ?? null,
    academic_interests: student.academic_interests ?? null,
    extracurricular_summary: student.extracurricular_summary ?? null,
    gpa_unweighted: student.gpa_unweighted,
    gpa_weighted: student.gpa_weighted,
    class_rank: student.class_rank ?? null,
    profile: profile
      ? {
          citizenship_status: profile.citizenship_status ?? null,
          budget_range: profile.budget_range ?? null,
          financial_aid_interest: profile.financial_aid_interest ?? null,
        }
      : null,
  };

  return (
    <>
      <Header
        title={`${student.first_name} ${student.last_name}`}
        description={[
          `Class of ${student.graduation_year}`,
          student.school_name ?? "No school",
          familyName ?? "No family",
        ].join(" · ")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STUDENT_STATUS_BADGES[student.status] ?? "default"}>
              {STUDENT_STATUS_LABELS[student.status] ?? student.status}
            </Badge>
            <Link
              href={`/students/${id}/progress?auto=0`}
              target="_blank"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Progress report
            </Link>
            <EditStudentForm student={editData} canArchive={canManageStaff} />
          </div>
        }
      />
      <StudentSubnav studentId={id} />
      <main className="p-4 sm:p-8">{children}</main>
    </>
  );
}
