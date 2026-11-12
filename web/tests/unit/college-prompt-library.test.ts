import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollegePromptSetRow } from "@/lib/db/queries";
vi.mock("@/components/layout/page-shell", () => ({ PageShell: ({ children }: { children: ReactNode }) => createElement("main", null, children) }));
import { CollegePromptLibrary } from "@/app/(dashboard)/essays/library/prompt-library-client";

const set: CollegePromptSetRow = {
  id: "set", scorecard_id: 99999, college_name: "Test University", entry_year: 2199,
  coverage: "verified", source_url: "https://example.edu/admissions", verified_on: "2026-10-25", notes: "First-year application",
  college_library_prompts: [{ id: "prompt", title: "Academic response", prompt_text: "Explain your interests.", word_limit: null, character_limit: 200, requirement: "required", text_kind: "summary", sort_order: 0 }],
};
describe("college prompt library coverage", () => {
  it("distinguishes summaries, character limits, entry years and source links", () => {
    const html = renderToStaticMarkup(createElement(CollegePromptLibrary, { sets: [set] }));
    expect(html).toContain("200 characters");
    expect(html).not.toContain("200 words");
    expect(html).toContain("Fall 2199");
    expect(html).toContain('href="https://example.edu/admissions"');
    expect(html).toContain("Summary — see the official source");
    expect(html).toContain("Automatically assigned when the college is added");
  });
  it("never promises automatic assignments for unverified or optional content", () => {
    for (const record of [{ ...set, coverage: "needs_review" as const }, { ...set, college_library_prompts: [{ ...set.college_library_prompts[0], requirement: "optional" as const }] }]) {
      const html = renderToStaticMarkup(createElement(CollegePromptLibrary, { sets: [record] }));
      expect(html).not.toContain("Automatically assigned when the college is added");
      expect(html).toContain("Not automatically assigned; review with the student");
    }
  });
  it("explains missing coverage rather than implying no essays are needed", () => {
    const html = renderToStaticMarkup(createElement(CollegePromptLibrary, { sets: [] }));
    expect(html).toContain("No verified library coverage found");
    expect(html).toContain("not covered");
  });
});
