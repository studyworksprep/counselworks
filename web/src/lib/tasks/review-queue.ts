import { getTasksNeedingReview } from "@/lib/db/queries";

/** A queue outage must not take down unrelated dashboard or task content. */
export async function getReviewQueueState() {
  try {
    return { available: true as const, tasks: await getTasksNeedingReview() };
  } catch (error) {
    const cause = error instanceof Error ? error.cause as { code?: string; message?: string } | undefined : undefined;
    console.error("Review queue unavailable", {
      message: error instanceof Error ? error.message : "Unknown queue error",
      code: cause?.code,
      databaseMessage: cause?.message,
    });
    return { available: false as const, tasks: [] };
  }
}
