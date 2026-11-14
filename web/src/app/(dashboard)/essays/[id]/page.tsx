import { notFound } from "next/navigation";
import { getEssayDraftById, getEssayFeedback } from "@/lib/db/queries";
import { isStaffRole, resolveUserAndFirm } from "@/lib/auth/resolve";
import { listStudentCollegesForSelect } from "@/lib/actions/colleges";
import { EssayEditorClient } from "./essay-editor-client";
import { EssayStoryReferences } from "@/components/interview/essay-story-references";

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
  const feedback = await getEssayFeedback(id);
  const collegesResult = await listStudentCollegesForSelect(essay.student_id);
  const collegeOptions =
    "colleges" in collegesResult && collegesResult.colleges
      ? collegesResult.colleges
      : [];

  return (
    <EssayEditorClient
      storyReferences={<EssayStoryReferences studentId={essay.student_id} essayId={id}/>}
      essay={essay}
      canReview={canReview}
      collegeOptions={collegeOptions}
      feedback={feedback}
    />
  );
}
