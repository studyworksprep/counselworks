import { getDb } from "@/lib/db/client";
import { enabledSupplementSources } from "@/lib/colleges/fetch-supplement";
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
  const enabled = enabledSupplementSources().includes(review.scorecard_id);
  const checked = enabled && review.review_state === "draft" ? await getDb().from("supplement_source_checks")
    .select("checked_at,source_text,issue").eq("scorecard_id",review.scorecard_id).eq("entry_year",review.entry_year).maybeSingle() : null;
  if (checked?.error) throw new Error("Unable to load the supplement source check.");
  return <PromptReviewEditor retrievalEnabled={enabled} sourceCheck={checked?.data ?? null} key={`${review.id}:${review.updated_at}`} review={review} canEdit={canMaintainCollegePrompts(ctx?.role ?? "")} canPublish={canPublishCollegePrompts(ctx?.role ?? "")} />;
}
