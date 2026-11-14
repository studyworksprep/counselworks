import { describe, expect, it } from "vitest";
import { strategySourcesCurrent, strategySourcesVisible, visibleStrategySections, type StrategySection } from "@/lib/interview/strategy";
import type { BankEntry, InterviewAnswer } from "@/lib/interview/template";

const answer = (id: string, kind: "student" | "parent", audience: "counselor" | "family") => ({ id, respondent_kind: kind, audience, revision: 1 }) as InterviewAnswer;
const story = (id: string, audience: "counselor" | "family", review_state: BankEntry["review_state"] = "confirmed"): BankEntry => ({
  id, student_id: "student", kind: "story", title: "Story", body: "Experience", reflection: "", tags: [],
  audience, review_state, revision: 1, story_ids: [], created_by_user_id: "student", source_answer_id: null,
  source_excerpt: null, updated_at: "2026-11-14T12:00:00Z",
});
const ref = (id: string, kind: "answer" | "bank" = "answer") => ({ id, kind, revision: 1 });
const section = (patch: Partial<StrategySection> = {}) => ({ id: "brief", section_key: "priorities", body: "Counselor synthesis", evidence: [], publication_state: "shared", student_review: "accurate", family_shared: true, ...patch }) as StrategySection;

describe("strategy brief independent audience filtering", () => {
  it("keeps counselor drafts and permanent private notes out of both portals", () => {
    const rows = [section({ publication_state: "draft" }), section({ section_key: "counselor_notes" })];
    const sources = { answers: [], entries: [] };
    expect(visibleStrategySections(rows, sources, "staff")).toHaveLength(2);
    expect(visibleStrategySections(rows, sources, "student")).toEqual([]);
    expect(visibleStrategySections(rows, sources, "parent")).toEqual([]);
  });
  it("requires student approval for parent access even without source links", () => {
    for (const patch of [{ family_shared: false }, { student_review: "pending" as const }, { student_review: "discuss" as const }]) {
      expect(visibleStrategySections([section(patch)], { answers: [], entries: [] }, "parent")).toEqual([]);
    }
    expect(visibleStrategySections([section()], { answers: [], entries: [] }, "parent")).toHaveLength(1);
  });
  it("does not launder private parent evidence into a student brief", () => {
    const sources = { answers: [answer("parent", "parent", "counselor")], entries: [] };
    expect(strategySourcesVisible([ref("parent")], sources, "student")).toBe(false);
    expect(visibleStrategySections([section({ evidence: [ref("parent")] })], sources, "student")).toEqual([]);
    expect(strategySourcesVisible([ref("parent")], { ...sources, answers: [answer("parent", "parent", "family")] }, "student")).toBe(true);
  });
  it("lets students read synthesis from their private answer while protecting parents", () => {
    const sources = { answers: [answer("student", "student", "counselor")], entries: [] };
    const row = section({ evidence: [ref("student")] });
    expect(visibleStrategySections([row], sources, "student")).toHaveLength(1);
    expect(visibleStrategySections([row], sources, "parent")).toEqual([]);
  });
  it("pauses parent access on a source revision without hiding student discussion context", () => {
    const sources = { answers: [{ ...answer("a", "student", "family"), revision: 2 }], entries: [] };
    const row = section({ evidence: [ref("a")] });
    expect(strategySourcesCurrent(row.evidence, sources)).toBe(false);
    expect(visibleStrategySections([row], sources, "student")).toHaveLength(1);
    expect(visibleStrategySections([row], sources, "parent")).toEqual([]);
  });
  it("blocks missing, unshared and unconfirmed supporting stories", () => {
    const row = section({ evidence: [ref("story", "bank")] });
    for (const entries of [[], [story("story", "counselor")], [story("story", "family", "draft")]]) {
      expect(visibleStrategySections([row], { answers: [], entries }, "parent")).toEqual([]);
    }
    expect(visibleStrategySections([row], { answers: [], entries: [story("story", "family")] }, "parent")).toHaveLength(1);
  });
  it("checks every source and the supporting stories of a narrative", () => {
    const narrative = { ...story("theme", "family"), kind: "narrative", story_ids: ["story"] } as BankEntry;
    const refs = [ref("a"), ref("theme", "bank")];
    const sources = { answers: [answer("a", "student", "family")], entries: [narrative, story("story", "family")] };
    expect(strategySourcesVisible(refs, sources, "family")).toBe(true);
    expect(strategySourcesVisible(refs, { ...sources, entries: [narrative, story("story", "counselor")] }, "family")).toBe(false);
    expect(strategySourcesVisible(refs, { ...sources, answers: [] }, "family")).toBe(false);
  });
});
