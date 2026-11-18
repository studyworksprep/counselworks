import { describe, it, expect } from "vitest";
import {
  compareSavedDrafts,
  feedbackInputSchema,
  importedCounselorOutline,
  outlineContentSchema,
  outlineContextCurrent,
  outlineFamilyReady,
  type OutlineContext,
} from "@/lib/essays/drafting";
import type { EssayPlan, PlanningEntry } from "@/lib/essays/planning";
const id = (n: number) =>
  `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = (patch: Partial<OutlineContext> = {}): OutlineContext => ({
  plan_revision: 1,
  prompt_signature: "a".repeat(32),
  prompt_set_id: id(5),
  source_versions: [{ id: id(10), revision: 1 }],
  ...patch,
});
const story: PlanningEntry = {
  id: id(10),
  kind: "story",
  title: "Shared scene",
  body: "A scene",
  reflection: "",
  tags: [],
  audience: "family",
  review_state: "confirmed",
  story_ids: [],
  revision: 1,
};
const plan: EssayPlan = {
  essay_id: id(1),
  approach: "experience",
  angle: "An angle",
  source_versions: [{ id: id(10), revision: 1 }],
  review_state: "confirmed",
  family_shared: true,
  revision: 1,
  updated_at: "2026-11-14T12:00:00Z",
};
describe("outline context and audiences", () => {
  it("requires the exact plan, prompt publication and displayed source revisions", () => {
    expect(outlineContextCurrent(context(), context())).toBe(true);
    for (const patch of [
      { plan_revision: 2 },
      { prompt_signature: "b".repeat(32) },
      { prompt_set_id: id(6) },
      { source_versions: [{ id: id(10), revision: 2 }] },
      { source_versions: [] },
      {
        source_versions: [
          { id: id(10), revision: 1 },
          { id: id(10), revision: 1 },
        ],
      },
    ])
      expect(outlineContextCurrent(context(), context(patch))).toBe(false);
  });
  it("compares source sets independently of storage order", () => {
    const a = context({
      source_versions: [
        { id: id(10), revision: 1 },
        { id: id(11), revision: 2 },
      ],
    });
    expect(
      outlineContextCurrent(a, {
        ...a,
        source_versions: [...a.source_versions].reverse(),
      }),
    ).toBe(true);
  });
  it("denies missing or malformed context", () => {
    expect(outlineContextCurrent(null, context())).toBe(false);
    expect(
      outlineContextCurrent(context(), {
        ...context(),
        prompt_signature: "forged",
      }),
    ).toBe(false);
  });
  it("requires independent essay, plan and material sharing", () => {
    expect(outlineFamilyReady("family", plan, context(), [story])).toBe(true);
    expect(outlineFamilyReady("student", plan, context(), [story])).toBe(false);
    for (const p of [
      null,
      { ...plan, family_shared: false },
      { ...plan, review_state: "draft" as const },
      { ...plan, revision: 2 },
      { ...plan, source_versions: [] },
    ])
      expect(outlineFamilyReady("family", p, context(), [story])).toBe(false);
  });
  it("does not reapprove a stale plan merely because the revised story is confirmed", () => {
    expect(
      outlineFamilyReady(
        "family",
        plan,
        context({ source_versions: [{ id: id(10), revision: 2 }] }),
        [{ ...story, revision: 2 }],
      ),
    ).toBe(false);
  });
  it("supports a research outline without sources or an earlier plan", () => {
    expect(
      outlineFamilyReady(
        "family",
        null,
        context({ plan_revision: null, source_versions: [] }),
        [],
      ),
    ).toBe(true);
  });
  it("honors private, unconfirmed and withdrawn supporting stories behind narratives", () => {
    const n = {
        ...story,
        id: id(11),
        kind: "narrative" as const,
        story_ids: [story.id],
      },
      p = { ...plan, source_versions: [{ id: n.id, revision: 1 }] },
      c = context({ source_versions: p.source_versions });
    expect(outlineFamilyReady("family", p, c, [story, n])).toBe(true);
    for (const entries of [
      [n],
      [{ ...story, audience: "counselor" as const }, n],
      [{ ...story, review_state: "draft" as const }, n],
    ])
      expect(outlineFamilyReady("family", p, c, entries)).toBe(false);
  });
  it("rejects duplicate sections, duplicate material and unknown JSON fields", () => {
    const beat = {
        id: id(1),
        heading: "Opening",
        notes: "Show the scene",
        entry_ids: [id(10)],
      },
      valid = { purpose: "Reveal a habit", beats: [beat] };
    expect(outlineContentSchema.safeParse(valid).success).toBe(true);
    for (const value of [
      { ...valid, beats: [beat, beat] },
      { ...valid, beats: [{ ...beat, entry_ids: [id(10), id(10)] }] },
      { ...valid, private_source: "snapshot" },
      { ...valid, beats: [{ ...beat, original_answer: "private" }] },
    ])
      expect(outlineContentSchema.safeParse(value).success).toBe(false);
  });
  it("imports counselor assistance into editable notes without inventing story connections", () => {
    const suggestion = {
      thesis: "A developing habit",
      beats: ["hook", "body", "body", "reflection"].map((section) => ({
        section,
        beat: "Explore one real detail",
        word_target: 50,
      })),
    };
    const imported = importedCounselorOutline(suggestion, [1, 2, 3, 4].map(id));
    expect(imported?.purpose).toBe(suggestion.thesis);
    expect(imported?.beats).toHaveLength(4);
    expect(imported?.beats.every((b) => b.entry_ids.length === 0)).toBe(true);
    expect(outlineContentSchema.safeParse(imported).success).toBe(true);
    expect(importedCounselorOutline(suggestion, [])).toBeNull();
    expect(
      importedCounselorOutline({ thesis: "invented" }, [1, 2, 3, 4].map(id)),
    ).toBeNull();
  });
  it("validates feedback version and anchor limits before the action runs", () => {
    expect(
      feedbackInputSchema.safeParse({
        versionNumber: 1,
        body: "A comment",
        quotedText: "A",
        anchorStart: 0,
        anchorEnd: 1,
      }).success,
    ).toBe(true);
    for (const patch of [
      { versionNumber: 0 },
      { anchorStart: -1 },
      { body: " " },
      { anchorEnd: NaN },
    ])
      expect(
        feedbackInputSchema.safeParse({
          versionNumber: 1,
          body: "Comment",
          ...patch,
        }).success,
      ).toBe(false);
  });
});
describe("saved-version comparisons", () => {
  const roundtrip = (before: string, after: string) => {
    const chunks = compareSavedDrafts(before, after);
    expect(
      chunks
        .filter((c) => c.kind !== "added")
        .map((c) => c.text)
        .join(""),
    ).toBe(before);
    expect(
      chunks
        .filter((c) => c.kind !== "removed")
        .map((c) => c.text)
        .join(""),
    ).toBe(after);
    return chunks;
  };
  it.each([
    ["", "First words"],
    ["Old words", ""],
    ["Same paragraph", "Same paragraph"],
    ["I helped the team.", "I listened to the team."],
    ["Opening\n\nA second scene.\n", "Opening\n\nA clearer second scene.\n"],
    ["Café — 🙂 together", "Café — 🙂 learning together"],
    ["a a b a", "a b a a"],
  ])("preserves both exact versions: %j → %j", (a, b) => {
    roundtrip(a, b);
  });
  it("identifies additions and removals while keeping shared text", () => {
    const chunks = roundtrip(
      "We built a robot.",
      "We rebuilt a robot together.",
    );
    expect(
      chunks.some((c) => c.kind === "added" && c.text.includes("rebuilt")),
    ).toBe(true);
    expect(
      chunks.some((c) => c.kind === "removed" && c.text.includes("built")),
    ).toBe(true);
    expect(chunks.some((c) => c.kind === "same" && c.text.includes("We"))).toBe(
      true,
    );
  });
  it("keeps a changed phrase together instead of using every space as an anchor", () => {
    expect(roundtrip("One clear old explanation.", "One entirely new explanation.")).toEqual([
      {kind:"same",text:"One "},
      {kind:"removed",text:"clear old "},
      {kind:"added",text:"entirely new "},
      {kind:"same",text:"explanation."},
    ]);
  });
  it("bounds comparison work for unusually large drafts without losing text", () => {
    roundtrip(
      "Shared\n" + "before ".repeat(3000) + "\nEnd",
      "Shared\n" + "after ".repeat(3000) + "\nEnd",
    );
  });
});
