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

describe("round → deadline anchoring (fix plan 8.7)", () => {
  it("anchors early rounds to senior fall and regular rounds to the graduation year", async () => {
    const { anchorDeadline } = await import("@/lib/constants/applications");
    expect(anchorDeadline("ea", 2028)).toBe("2027-11-01");
    expect(anchorDeadline("ed", 2028)).toBe("2027-11-01");
    expect(anchorDeadline("rea", 2028)).toBe("2027-11-01");
    expect(anchorDeadline("ed2", 2028)).toBe("2028-01-01");
    expect(anchorDeadline("rd", 2028)).toBe("2028-01-15");
  });

  it("rolling and unknown rounds have no default deadline", async () => {
    const { anchorDeadline } = await import("@/lib/constants/applications");
    expect(anchorDeadline("rolling", 2028)).toBeNull();
    expect(anchorDeadline("nonsense", 2028)).toBeNull();
    expect(anchorDeadline(null, 2028)).toBeNull();
    expect(anchorDeadline("ea", null)).toBeNull();
  });

  it("firm overrides win and derive the year from the month", async () => {
    const { anchorDeadline } = await import("@/lib/constants/applications");
    expect(
      anchorDeadline("ea", 2028, { ea: { month: 10, day: 15 } })
    ).toBe("2027-10-15");
    expect(
      anchorDeadline("rd", 2028, { rd: { month: 2, day: 1 } })
    ).toBe("2028-02-01");
  });

  it("parses override JSON defensively", async () => {
    const { parseRoundAnchorOverrides } = await import(
      "@/lib/constants/applications"
    );
    expect(
      parseRoundAnchorOverrides({
        ea: { month: 10, day: 15 },
        bogus_round: { month: 1, day: 1 },
        ed: { month: 13, day: 1 },
        rd: "nonsense",
      })
    ).toEqual({ ea: { month: 10, day: 15 } });
    expect(parseRoundAnchorOverrides(null)).toEqual({});
    expect(parseRoundAnchorOverrides("x")).toEqual({});
  });
});
