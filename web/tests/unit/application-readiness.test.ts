import { describe, expect, it } from "vitest";
import { deadlineAttention } from "@/lib/applications/readiness";

describe("application deadline attention", () => {
  it("uses calendar dates and a fourteen-day window", () => {
    expect(
      deadlineAttention("2026-11-13T00:00:00Z", "2026-11-14", "in_progress"),
    ).toBe("Past due");
    expect(deadlineAttention("2026-11-14", "2026-11-14", "in_progress")).toBe(
      "Due soon",
    );
    expect(deadlineAttention("2026-11-28", "2026-11-14", "not_started")).toBe(
      "Due soon",
    );
    expect(
      deadlineAttention("2026-11-29", "2026-11-14", "in_progress"),
    ).toBeNull();
  });
  it("does not flag submitted, decided, withdrawn, missing or malformed dates", () => {
    for (const stage of [
      "submitted",
      "under_review",
      "decision_received",
      "withdrawn",
    ])
      expect(deadlineAttention("2026-11-01", "2026-11-14", stage)).toBeNull();
    expect(deadlineAttention(null, "2026-11-14", "in_progress")).toBeNull();
    expect(
      deadlineAttention("2026-02-30", "2026-11-14", "in_progress"),
    ).toBeNull();
  });
});
