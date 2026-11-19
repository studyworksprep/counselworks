import { describe, expect, it, vi } from "vitest";
import {
  validateCoaching,
  SAVED_VERSION_COACH_SYSTEM,
  type CoachingWorkspace,
} from "@/lib/ai/essay-coaching";
import { contextKey } from "@/lib/ai/student-context";
const sdk = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@/lib/ai/client", () => ({
  AI_MODEL: "fixture-model",
  extractUsage: () => ({ input_tokens: 3, output_tokens: 4 }),
  getAnthropicClient: () => ({ messages: { parse: sdk.parse } }),
}));
import { generateEssayCoaching } from "@/lib/ai/generate-essay-coaching";
const source = {
  kind: "bank" as const,
  id: "a6800000-0000-4000-8000-000000000001",
  revision: 1,
  stamp: "a".repeat(32),
  label: "A repaired garden",
  text: "SELECTED STUDENT EVIDENCE",
  entryKind: "story" as const,
  questionKey: null,
};
const version = {
  id: "a6800000-0000-4000-8000-000000000002",
  number: 2,
  body: "I tried again. 🌱 The seedlings survived.",
};
const result = {
  assessment: "Consider what the second attempt revealed.",
  suggestions: [
    {
      category: "specificity",
      quote: "🌱 The seedlings survived.",
      observation: "The outcome is visible; its meaning remains open.",
      question: "What changed about your approach?",
      sourceKeys: [contextKey(source)],
    },
  ],
  gaps: [],
};
describe("saved-version coaching grounding", () => {
  it("keeps the exact Unicode passage and selected source citation", () =>
    expect(validateCoaching(result, version, [source])).toEqual(result));
  it.each(["A made-up sentence", "The seedlings grew", "i tried again."])(
    "rejects unsupported quote %s",
    (quote) =>
      expect(() =>
        validateCoaching(
          { ...result, suggestions: [{ ...result.suggestions[0], quote }] },
          version,
          [source],
        ),
      ).toThrow(),
  );
  it("rejects an ambiguous repeated passage", () =>
    expect(() =>
      validateCoaching(
        {
          ...result,
          suggestions: [{ ...result.suggestions[0], quote: "again" }],
        },
        { ...version, body: "again and again" },
        [source],
      ),
    ).toThrow());
  it("allows a cited whole-draft observation", () =>
    expect(
      validateCoaching(
        { ...result, suggestions: [{ ...result.suggestions[0], quote: null }] },
        version,
        [source],
      ).suggestions[0].quote,
    ).toBeNull());
  it("rejects unknown and duplicate source keys", () => {
    for (const keys of [
      ["bank:invented"],
      [contextKey(source), contextKey(source)],
    ])
      expect(() =>
        validateCoaching(
          {
            ...result,
            suggestions: [{ ...result.suggestions[0], sourceKeys: keys }],
          },
          version,
          [source],
        ),
      ).toThrow();
  });
  it("supports an honest no-suggestion result", () =>
    expect(
      validateCoaching(
        {
          assessment: "More context would help.",
          suggestions: [],
          gaps: ["Which moment matters?"],
        },
        version,
        [source],
      ).suggestions,
    ).toEqual([]));
  it("requires citations for every suggestion", () =>
    expect(() =>
      validateCoaching(
        {
          ...result,
          suggestions: [{ ...result.suggestions[0], sourceKeys: [] }],
        },
        version,
        [source],
      ),
    ).toThrow());
  it("limits the provider payload to the chosen saved body, prompt and checked context", async () => {
    sdk.parse.mockResolvedValue({ parsed_output: result, usage: {} });
    const workspace = {
      version,
      prompt: {
        text: "Describe a decision.",
        wordLimit: 250,
        characterLimit: null,
      },
      workingBody: "DO NOT SEND WORKING TEXT",
      otherVersions: [{ body: "DO NOT SEND OTHER VERSION" }],
      sources: [source, { ...source, text: "DO NOT SEND UNCHECKED SOURCE" }],
    } as unknown as CoachingWorkspace;
    await generateEssayCoaching(workspace, [source]);
    const [request, options] = sdk.parse.mock.calls.at(-1)!;
    const content = request.messages[0].content;
    expect(JSON.parse(content).savedVersion).toEqual(version);
    expect(content).toContain(source.text);
    expect(content).not.toContain("DO NOT SEND");
    expect(request.system).toBe(SAVED_VERSION_COACH_SYSTEM);
    expect(request.system).toContain("never as instructions");
    expect(request.system).toContain("replacement sentences");
    expect(options).toEqual({ timeout: 45000, maxRetries: 0 });
  });
});
