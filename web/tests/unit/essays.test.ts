import { describe, expect, it } from "vitest";
import {
  ESSAY_STATUSES,
  ESSAY_STATUS_VALUES,
  ESSAY_STATUS_LABELS,
  ESSAY_STATUS_PORTAL_LABELS,
  ESSAY_STATUS_BADGES,
  resolveWordLimit,
} from "@/lib/constants/essays";

describe("essay status map (single source of truth, fix plan 7.7)", () => {
  it("defines the whole review loop, once", () => {
    expect([...ESSAY_STATUS_VALUES].sort()).toEqual([
      "approved",
      "draft",
      "final",
      "in_review",
      "revision_requested",
    ]);
  });

  it("every status has a staff label, a portal label, and ONE badge color", () => {
    for (const { value } of ESSAY_STATUSES) {
      expect(ESSAY_STATUS_LABELS[value], value).toBeTruthy();
      expect(ESSAY_STATUS_PORTAL_LABELS[value], value).toBeTruthy();
      expect(ESSAY_STATUS_BADGES[value], value).toBeTruthy();
    }
  });

  it("staff and portal render the same status in the same color", () => {
    // The defect was three hand-copied maps disagreeing on color; both label
    // columns key into the SAME badge map, so a divergence is impossible.
    expect(Object.keys(ESSAY_STATUS_BADGES).sort()).toEqual(
      Object.keys(ESSAY_STATUS_PORTAL_LABELS).sort(),
    );
  });
});

describe("resolveWordLimit (one rule for both editors)", () => {
  it("prefers the analyzed limit over the manual target", () => {
    expect(
      resolveWordLimit({ word_count_limit: 650, word_count_target: 500 }),
    ).toBe(650);
  });

  it("falls back to the target, then to null", () => {
    expect(
      resolveWordLimit({ word_count_limit: null, word_count_target: 500 }),
    ).toBe(500);
    expect(
      resolveWordLimit({ word_count_limit: null, word_count_target: null }),
    ).toBeNull();
    expect(resolveWordLimit({})).toBeNull();
  });
});
