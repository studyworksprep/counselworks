import { describe, expect, it } from "vitest";
import {
  buildDefaultChecklist,
  parseChecklist,
  ROUND_VALUES,
  ROUND_SHORT_LABELS,
  APPLICATION_STAGES,
  STAGE_VALUES,
  STAGE_LABELS,
  KANBAN_SETTABLE_STAGE_VALUES,
} from "@/lib/constants/applications";

describe("application round enum (single source of truth)", () => {
  it("uses short codes only — the early_action/ea split must never return", () => {
    expect(ROUND_VALUES.has("ea")).toBe(true);
    expect(ROUND_VALUES.has("early_action")).toBe(false);
    expect(ROUND_VALUES.has("regular")).toBe(false);
    for (const value of ROUND_VALUES) {
      expect(ROUND_SHORT_LABELS[value]).toBeTruthy();
    }
  });
});

describe("application stage guardrails (fix plan 7.6)", () => {
  it("every stage has a label and a board column definition", () => {
    for (const stage of APPLICATION_STAGES) {
      expect(STAGE_LABELS[stage.value], stage.value).toBeTruthy();
      expect(stage.boardColor, stage.value).toBeTruthy();
    }
  });

  it("the kanban can never write decision_received — Record Decision owns it", () => {
    expect(STAGE_VALUES.has("decision_received")).toBe(true);
    expect(KANBAN_SETTABLE_STAGE_VALUES.has("decision_received")).toBe(false);
  });

  it("kanban-settable stages are a strict subset of the shared enum", () => {
    for (const value of KANBAN_SETTABLE_STAGE_VALUES) {
      expect(STAGE_VALUES.has(value), value).toBe(true);
    }
    expect(KANBAN_SETTABLE_STAGE_VALUES.has("decision received")).toBe(false);
    expect(KANBAN_SETTABLE_STAGE_VALUES.has("accepted")).toBe(false);
  });
});

describe("buildDefaultChecklist", () => {
  it("adds aid items only when financial aid is required", () => {
    const noAid = buildDefaultChecklist({ round: "rd" });
    const withAid = buildDefaultChecklist({
      round: "rd",
      financialAidRequired: true,
    });
    expect(noAid.some((i) => i.key === "fafsa")).toBe(false);
    expect(withAid.some((i) => i.key === "fafsa")).toBe(true);
    expect(withAid.some((i) => i.key === "css_profile")).toBe(true);
  });

  it("adds the ED agreement for binding rounds only", () => {
    expect(
      buildDefaultChecklist({ round: "ed" }).some(
        (i) => i.key === "ed_agreement",
      ),
    ).toBe(true);
    expect(
      buildDefaultChecklist({ round: "ed2" }).some(
        (i) => i.key === "ed_agreement",
      ),
    ).toBe(true);
    expect(
      buildDefaultChecklist({ round: "ea" }).some(
        (i) => i.key === "ed_agreement",
      ),
    ).toBe(false);
  });

  it("always starts unchecked and ends with the final review", () => {
    const items = buildDefaultChecklist({ round: "rolling" });
    expect(items.every((i) => i.done === false)).toBe(true);
    expect(items[items.length - 1].key).toBe("final_review");
  });
});

describe("parseChecklist", () => {
  it("round-trips a stored checklist", () => {
    const original = buildDefaultChecklist({ round: "ea" });
    const stored = JSON.parse(JSON.stringify(original));
    expect(parseChecklist(stored)).toEqual(original);
  });

  it("returns null for legacy/garbage values so defaults get seeded", () => {
    expect(parseChecklist(null)).toBeNull();
    expect(parseChecklist([])).toBeNull();
    expect(parseChecklist("not json")).toBeNull();
    expect(parseChecklist([{ nonsense: true }])).toBeNull();
  });

  it("preserves done flags strictly", () => {
    const parsed = parseChecklist([
      { key: "a", label: "A", done: true },
      { key: "b", label: "B", done: "yes" },
    ]);
    expect(parsed).toEqual([
      { key: "a", label: "A", done: true },
      { key: "b", label: "B", done: false },
    ]);
  });
});
