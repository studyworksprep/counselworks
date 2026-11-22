import { describe, expect, it } from "vitest";
import { BOSTON_COLLEGE_SUPPLEMENT_URL, importBostonCollegeSupplement } from "@/lib/colleges/prompt-import";
import { promptReviewSchema } from "@/lib/colleges/prompt-review";

const copiedSection = [
  "Supplemental Questions 2026-27",
  "Please respond to one of the first four prompts (400 word limit). Human Centered Engineering applicants should respond to Prompt #5 instead.",
  "1. Which annual event changed how you see your neighborhood?",
  "2. What did you learn from a conversation with a friend?",
  "3. When did someone misunderstand your intentions?",
  "4. How would you put a new value into practice?",
  "5. Human-Centered Engineering (HCE) Applicants only: What question would you investigate in a design lab?",
].join("\n\n");

describe("importBostonCollegeSupplement", () => {
  it("keeps the numbered alternatives together and uses the existing assignment keys", () => {
    const result = importBostonCollegeSupplement(copiedSection, 2027, []);
    expect(result.error).toBeUndefined();
    expect(result.content).toMatchObject({
      source_url: BOSTON_COLLEGE_SUPPLEMENT_URL,
      coverage: "needs_review",
      verified_on: null,
      prompts: [
        { prompt_key: "choice", word_limit: 400, requirement: "conditional", text_kind: "verbatim" },
        { prompt_key: "engineering", word_limit: null, requirement: "conditional", text_kind: "verbatim" },
      ],
    });
    const content = promptReviewSchema.parse({ review_due_on: null, review_notes: "", ...result.content });
    expect(content.prompts[0].prompt_text).toBe(copiedSection.split("\n\n").slice(1, -1).join("\n\n"));
    expect(content.prompts[1].prompt_text).toBe(copiedSection.split("\n\n").at(-1)?.slice(3));
  });

  it("updates the two recognized slots and retains other firm responses", () => {
    const initial = importBostonCollegeSupplement(copiedSection, 2027, []).content!.prompts!;
    const other = { ...initial[0], prompt_key: "another-program" };
    const updated = importBostonCollegeSupplement(copiedSection.replace("400", "350"), 2027, [...initial, other]);
    expect(updated.content?.prompts?.map(prompt => [prompt.prompt_key, prompt.word_limit])).toEqual([
      ["choice", 350], ["engineering", null], ["another-program", 400],
    ]);
  });

  it("accepts a full cycle year, CRLF and the heading that follows the supplement", () => {
    const copied = copiedSection.replace("2026-27", "2026–2027") + "\n\nStandardized Testing\n\nMore admissions information.";
    expect(importBostonCollegeSupplement(copied.replaceAll("\n", "\r\n"), 2027, []).error).toBeUndefined();
  });

  it.each([
    [copiedSection, 2028],
    [copiedSection.replace("2026-27", "2025-27"), 2027],
    [copiedSection.replace(/4\. How[^\n]+/, ""), 2027],
    [copiedSection.replace("Prompt #5", "Prompt #6"), 2027],
    [copiedSection.replace(" (400 word limit)", ""), 2027],
    [copiedSection.slice(0, -8), 2027],
  ] as const)("rejects wrong cycles and incomplete or changed formats", (clipboard, year) => {
    expect(importBostonCollegeSupplement(clipboard, year, []).error).toBeTruthy();
  });
});

import { extractSupplement } from "@/lib/colleges/fetch-supplement";

describe("registered official pages", () => {
  it("recovers numbered alternatives from an HTML list and excludes subsequent sections", () => {
    const [heading, intro, ...questions] = copiedSection.split("\n\n");
    const html = `<h3>${heading}</h3><p>${intro}</p><ol>${questions.map(q=>`<li>${q.slice(3)}</li>`).join("")}</ol><h3>Standardized Testing</h3>`;
    expect(extractSupplement(html,164924,2027)).toBe(copiedSection);
  });
  it.each([
    [130794,"First-year applicants can review the 2026-2027 essay topics.","Learn more about first-year admission"],
    [186131,"Questions for the 2026-27 application cycle.","From Our Blog and Podcast"],
  ] as const)("checks the cycle and the end of the section for %s", (id,heading,end)=>{
    const html = `<h2>${heading}</h2>${id===186131 ? "<h3>For A.B. Degree Applicants</h3>" : ""}<p>What would you study &amp; why?</p><h2>${end}</h2><p>Other articles</p>`;
    expect(extractSupplement(html,id,2027)).toContain("study & why?");
    expect(extractSupplement(html,id,2027)).not.toContain("Other articles");
    expect(()=>extractSupplement(html,id,2028)).toThrow(/cycle/);
    expect(()=>extractSupplement(html.replace(end,"Archives"),id,2027)).toThrow(/layout/);
  });
});
