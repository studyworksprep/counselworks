import { notFound } from "next/navigation";
import { getApplicationFinalReview } from "@/lib/db/queries";
import { FinalApplicationReview } from "./final-review";

export async function ApplicationFinalReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getApplicationFinalReview(id);
  if (!data) notFound();
  // The client explicitly refreshes after writes. Background route refreshes
  // must not swap the displayed review or reset a confirmation under the user.
  return <FinalApplicationReview key={id} initialData={data} />;
}
