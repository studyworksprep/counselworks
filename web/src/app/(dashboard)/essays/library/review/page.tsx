import { getCollegePromptLibrary, getCollegePromptReviews } from "@/lib/db/queries";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { canMaintainCollegePrompts } from "@/lib/auth/authorize";
import { PromptReviewQueue } from "./review-queue";

export default async function PromptReviewsPage() {
  const [sets, reviews, ctx] = await Promise.all([getCollegePromptLibrary(), getCollegePromptReviews(), resolveUserAndFirm()]);
  return <PromptReviewQueue sets={sets} reviews={reviews} canEdit={canMaintainCollegePrompts(ctx?.role ?? "")} today={new Date().toISOString().slice(0, 10)} />;
}
