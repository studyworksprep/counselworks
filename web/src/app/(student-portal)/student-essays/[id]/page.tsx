import { notFound } from "next/navigation";
import { getStudentEssayById, getEssayFeedback } from "@/lib/db/queries";
import { PortalEssayEditor } from "./portal-essay-editor";
import { EssayStoryReferences } from "@/components/interview/essay-story-references";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StudentEssayPage({ params }: Props) {
  const { id } = await params;
  const essay = await getStudentEssayById(id);
  if (!essay) return notFound();

  const feedback = await getEssayFeedback(id);
  return <PortalEssayEditor essay={essay} feedback={feedback} storyReferences={<EssayStoryReferences studentId={essay.student_id} essayId={id}/>} />;
}
