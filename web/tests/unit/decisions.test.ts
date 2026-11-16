import { describe, it, expect } from "vitest";
import {
  decisionSchema,
  nextStepSchema,
  decisionStepKind,
  decisionWorkspacePath,
} from "../../src/lib/applications/decisions";
const id = "a0000000-0000-4000-8000-000000000001";
describe("Decision and enrollment validation", () => {
  it("uses shared outcomes and requires real dates and revisions", () => {
    const value = {
      applicationId: id,
      revision: 0,
      result: "accepted",
      decidedOn: "2026-11-16",
      depositStatus: "committed",
      prepareFollowUp: false,
    };
    expect(decisionSchema.safeParse(value).success).toBe(true);
    expect(
      decisionSchema.safeParse({ ...value, result: "deferred" }).success,
    ).toBe(false);
    expect(
      decisionSchema.safeParse({ ...value, decidedOn: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      decisionSchema.safeParse({ ...value, revision: undefined }).success,
    ).toBe(false);
  });
  it("distinguishes checklist confirmation from a follow-up being completed", () => {
    const value = {
      applicationId: id,
      revision: 0,
      decisionRevision: 1,
      kind: "enrollment",
      title: "Deposit",
      status: "needed",
      dueOn: "2027-05-01",
      completedOn: null,
      notes: "",
    };
    expect(nextStepSchema.safeParse(value).success).toBe(true);
    expect(
      nextStepSchema.safeParse({ ...value, status: "completed" }).success,
    ).toBe(false);
    expect(
      nextStepSchema.safeParse({
        ...value,
        status: "completed",
        completedOn: "2026-11-16",
      }).success,
    ).toBe(true);
    expect(
      nextStepSchema.safeParse({ ...value, completedOn: "2026-11-16" }).success,
    ).toBe(false);
    expect(
      nextStepSchema.safeParse({ ...value, id, revision: 0 }).success,
    ).toBe(false);
  });
  it("preserves absent resource fields instead of turning them into removals", () => {
    const parsed = nextStepSchema.parse({
      applicationId: id,
      id,
      revision: 2,
      decisionRevision: 1,
      kind: "waitlist",
      title: "Letter",
      status: "needed",
      dueOn: null,
      completedOn: null,
      notes: "Keep linked writing",
    });
    expect(parsed.essayId).toBeUndefined();
    expect(parsed.documentId).toBeUndefined();
  });
  it("maps only actionable outcomes into the appropriate role workspace", () => {
    expect(decisionStepKind("accepted")).toBe("enrollment");
    expect(decisionStepKind("waitlisted")).toBe("waitlist");
    expect(decisionStepKind("deferred")).toBe("deferral");
    expect(decisionStepKind("rejected")).toBeNull();
    expect(decisionWorkspacePath(id, "family")).toBe(
      `/family-applications/${id}/decisions`,
    );
  });
});
