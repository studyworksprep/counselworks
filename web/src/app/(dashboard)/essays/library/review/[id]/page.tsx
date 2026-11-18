import { notFound } from "next/navigation";
import { getCollegePromptReviews } from "@/lib/db/queries";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { canMaintainCollegePrompts, canPublishCollegePrompts } from "@/lib/auth/authorize";
import { PromptReviewEditor } from "../review-editor";
export default async function PromptReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [reviews, ctx] = await Promise.all([getCollegePromptReviews(), resolveUserAndFirm()]);
  const review = reviews.find(r => r.id === id);
  if (!review) notFound();
  return <PromptReviewEditor key={`${review.id}:${review.updated_at}`} review={review} canEdit={canMaintainCollegePrompts(ctx?.role ?? "")} canPublish={canPublishCollegePrompts(ctx?.role ?? "")} />;
}
