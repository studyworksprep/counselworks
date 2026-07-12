import { describe, expect, it } from "vitest";
import {
  STUDENT_STATUSES,
  STUDENT_STATUS_VALUES,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_BADGES,
  EDITABLE_STUDENT_STATUS_VALUES,
} from "@/lib/constants/students";

describe("student status enum (single source of truth, fix plan 7.4)", () => {
  it("uses one vocabulary — the inactive/paused split must never return", () => {
    expect(STUDENT_STATUS_VALUES.has("paused")).toBe(true);
    expect(STUDENT_STATUS_VALUES.has("inactive")).toBe(false);
    expect(STUDENT_STATUS_VALUES.has("prospective")).toBe(false);
    expect([...STUDENT_STATUS_VALUES].sort()).toEqual([
      "active",
      "archived",
      "graduated",
      "paused",
    ]);
  });

  it("every status has a label and a badge variant — no unknown gray badges", () => {
    for (const { value } of STUDENT_STATUSES) {
      expect(STUDENT_STATUS_LABELS[value], value).toBeTruthy();
      expect(STUDENT_STATUS_BADGES[value], value).toBeTruthy();
    }
  });

  it("the edit form cannot write 'archived' — archiveStudent owns that transition (7.5)", () => {
    expect(EDITABLE_STUDENT_STATUS_VALUES.has("archived")).toBe(false);
    expect(EDITABLE_STUDENT_STATUS_VALUES.has("active")).toBe(true);
    expect(EDITABLE_STUDENT_STATUS_VALUES.has("paused")).toBe(true);
    expect(EDITABLE_STUDENT_STATUS_VALUES.has("graduated")).toBe(true);
  });
});
