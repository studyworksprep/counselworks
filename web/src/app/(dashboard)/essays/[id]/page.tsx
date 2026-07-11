import { notFound } from "next/navigation";
import { getEssayDraftById } from "@/lib/db/queries";
import { isStaffRole, resolveUserAndFirm } from "@/lib/auth/resolve";
import { listStudentCollegesForSelect } from "@/lib/actions/colleges";
import { EssayEditorClient } from "./essay-editor-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EssayDetailPage({ params }: Props) {
  const { id } = await params;
  const [essay, ctx] = await Promise.all([
    getEssayDraftById(id),
    resolveUserAndFirm(),
  ]);

  if (!essay) return notFound();

  const canReview = !!ctx && isStaffRole(ctx.role);
  const collegesResult = await listStudentCollegesForSelect(essay.student_id);
  const collegeOptions =
    "colleges" in collegesResult && collegesResult.colleges
      ? collegesResult.colleges
      : [];

  return (
    <EssayEditorClient
      essay={essay}
      canReview={canReview}
      collegeOptions={collegeOptions}
    />
  );
}
