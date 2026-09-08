import { describe, expect, it } from "vitest";
import { taskTransitionAllowed } from "@/lib/constants/tasks";
describe("task transitions", () => {
  it("rejects invalid states for every persona", () => {
    for (const portal of [true, false]) {
      expect(taskTransitionAllowed("pending", "approved", portal, "general")).toBe(false);
      expect(taskTransitionAllowed("unknown", "completed", portal, "general")).toBe(false);
    }
  });
  it("allows the simple completion and reopen paths", () => {
    expect(taskTransitionAllowed("pending", "completed", true, "general")).toBe(true);
    expect(taskTransitionAllowed("completed", "pending", true, "general")).toBe(true);
  });
  it("portal owners cannot approve reviews or cancel tasks", () => {
    expect(taskTransitionAllowed("pending", "completed", true, "review")).toBe(false);
    expect(taskTransitionAllowed("pending", "cancelled", true, "general")).toBe(false);
    expect(taskTransitionAllowed("cancelled", "completed", true, "general")).toBe(false);
  });
});
