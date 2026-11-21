import { describe, expect, it } from "vitest";
import { readAssistanceResult, validateAssistance, contextKey, type StudentContextSource } from "@/lib/ai/student-context";

const source: StudentContextSource = { kind: "answer", id: "a7000000-0000-4000-8000-000000000001", revision: 1, stamp: "a".repeat(32), label: "D1", questionKey: "D1", entryKind: null, text: "I have not described a specific experience yet." };
const gap = { outcome: "needs_more_context", items: [], contextGap: { reason: "The response has no described experience yet.", followUpQuestion: "Which small moment from a recent day, if any, would you like to describe?", sourceKeys: [contextKey(source)] } };
const item = { title: "A described repair", body: "The student repaired a wheel.", reason: "Explore a documented action.", sourceKeys: [contextKey(source)], questionKey: null, sectionKey: null };

describe("explicit interview context gaps", () => {
  it.each(["story", "narrative", "strategy"] as const)("accepts a cited gap with no proposals for %s", mode => {
    expect(validateAssistance(gap, mode, [source], [])).toEqual(gap);
  });
  it("keeps parent/question assistance in the existing question workflow", () => {
    expect(() => validateAssistance(gap, "questions", [source], ["D1"])).toThrow(/context-gap/);
  });
  it.each([
    { ...gap, items: [item] },
    { ...gap, contextGap: null },
    { outcome: "suggestions", items: [], contextGap: null },
    { outcome: "suggestions", items: [item], contextGap: gap.contextGap },
    { ...gap, outcome: "unknown" },
  ])("rejects mixed, missing or unknown outcomes", value => {
    expect(() => validateAssistance(value, "story", [source], [])).toThrow();
  });
  it.each([[], ["answer:unselected"], [contextKey(source), contextKey(source)]].map(sourceKeys => ({ sourceKeys })))("requires distinct, genuinely selected gap citations", ({ sourceKeys }) => {
    expect(() => validateAssistance({ ...gap, contextGap: { ...gap.contextGap, sourceKeys } }, "story", [source], [])).toThrow();
  });
  it.each(["", " ", "x".repeat(601)])("requires a bounded, actual follow-up question", followUpQuestion => {
    expect(() => validateAssistance({ ...gap, contextGap: { ...gap.contextGap, followUpQuestion } }, "story", [source], [])).toThrow();
  });
  it("reads earlier results as suggestions without changing their saved JSON", () => {
    const legacy = Object.freeze({ items: [item] });
    const before = JSON.stringify(legacy);
    expect(readAssistanceResult(legacy, "story", [source], [])).toEqual({ outcome: "suggestions", items: [item], contextGap: null });
    expect(JSON.stringify(legacy)).toBe(before);
    expect(() => validateAssistance(legacy, "story", [source], [])).toThrow();
  });
  it("never reinterprets a malformed new result as historical suggestions", () => {
    expect(() => readAssistanceResult({ ...gap, items: [item] }, "story", [source], [])).toThrow();
  });
});
