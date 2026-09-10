import { afterEach, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/queries", () => ({ getTasksNeedingReview: read }));
import { getReviewQueueState } from "@/lib/tasks/review-queue";
afterEach(() => vi.restoreAllMocks());
it("keeps an unavailable queue distinct from a successfully empty queue", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  read.mockRejectedValueOnce(new Error("Unable to load review queue", {cause:{code:"42703",message:"column unavailable"}}));
  expect(await getReviewQueueState()).toEqual({available:false,tasks:[]});
  expect(log).toHaveBeenCalledWith("Review queue unavailable", expect.objectContaining({code:"42703",databaseMessage:"column unavailable"}));
  read.mockResolvedValueOnce([]);
  expect(await getReviewQueueState()).toEqual({available:true,tasks:[]});
});
it("preserves the authorized queue rows", async () => {
  const tasks = [{id:"authorized-task",title:"Review essay"}];
  read.mockResolvedValueOnce(tasks);
  expect(await getReviewQueueState()).toEqual({available:true,tasks});
});

// The query still owns authorization; the availability layer never substitutes
// a broader query when it fails.
it("does not retry with broader permissions after a lookup failure", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  read.mockClear();read.mockRejectedValueOnce(new Error("Unable to load task"));
  expect((await getReviewQueueState()).available).toBe(false);
  expect(read).toHaveBeenCalledTimes(1);
});
