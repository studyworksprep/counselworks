import { getDb } from "@/lib/db/client";
import { enabledSupplementSources } from "@/lib/colleges/fetch-supplement";
import { getCollegePromptLibrary, getCollegePromptReviews } from "@/lib/db/queries";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { canMaintainCollegePrompts } from "@/lib/auth/authorize";
import { PromptReviewQueue } from "./review-queue";

export default async function PromptReviewsPage() {
  const [sets, reviews, ctx] = await Promise.all([getCollegePromptLibrary(), getCollegePromptReviews(), resolveUserAndFirm()]);
  const ids = enabledSupplementSources();
  const checks = ctx && ids.length ? await getDb().from("supplement_source_checks").select("scorecard_id,entry_year,changed_at,issue").in("scorecard_id",ids) : null;
  if (checks?.error) throw new Error("Unable to load source check status.");
  return <PromptReviewQueue checks={checks?.data ?? []} sets={sets} reviews={reviews} canEdit={canMaintainCollegePrompts(ctx?.role ?? "")} today={new Date().toISOString().slice(0, 10)} />;
}
