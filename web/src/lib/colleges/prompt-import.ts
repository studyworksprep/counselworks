import type { PromptReviewInput } from "./prompt-review";

export const BOSTON_COLLEGE_SCORECARD_ID = 164924;
export const BOSTON_COLLEGE_SUPPLEMENT_URL = "https://www.bc.edu/bc-web/admission/apply/";

const BOSTON_COLLEGE_GUIDANCE = "Common App applicants outside Human-Centered Engineering choose one of prompts 1–4. Human-Centered Engineering applicants answer prompt 5 instead. For the QuestBridge Questionnaire, only Human-Centered Engineering applicants submit the supplement. Confirm the applicable route and limits in the student’s application.";

/** Convert one counselor-supplied copy of BC's published section into two response slots. */
export function importBostonCollegeSupplement(
  clipboard: string,
  entryYear: number,
  existing: PromptReviewInput["prompts"],
): { content: Partial<PromptReviewInput>; error?: never } | { error: string; content?: never } {
  const section = clipboard.trim().replace(/\r\n?/g, "\n");
  const heading = /^Supplemental Questions[ \t]+(\d{4})\s*[-–—]\s*(\d{2}|\d{4})[ \t]*$/im.exec(section);
  if (!heading) return { error: "Include the Supplemental Questions heading and its application cycle." };
  const endYear = heading[2].length === 2 ? String(entryYear).slice(-2) : String(entryYear);
  if (Number(heading[1]) !== entryYear - 1 || heading[2] !== endYear) {
    return { error: `The copied section does not match Fall ${entryYear} entry.` };
  }

  const body = section.slice(heading.index + heading[0].length)
    .split(/^\s*Standardized Testing\s*$/im, 1)[0];
  const markers = [...body.matchAll(/^[^\S\n]*([1-9]\d*)[.)][ \t\u00a0]+/gm)];
  const directions = body.slice(0, markers[0]?.index ?? 0).trim();
  const wordLimit = /\b([1-9]\d{0,4})[-\s]+word limit\b/i.exec(directions);
  if (markers.map(match => match[1]).join(",") !== "1,2,3,4,5" ||
    !/\bone of the first four prompts\b/i.test(directions) ||
    !/\bHuman[- ]Centered Engineering\b[^.]*\bPrompt\s*#?5\b/i.test(directions) || !wordLimit) {
    return { error: "Include Boston College’s directions, the word limit, and all five numbered prompts. If the format changed, enter the responses in the editor." };
  }

  const questions = markers.map((marker, index) =>
    body.slice(marker.index + marker[0].length, markers[index + 1]?.index).trim());
  const engineering = questions[4];
  if (questions.some(question => !question || !question.endsWith("?")) ||
    !/^Human[- ]Centered Engineering\b/i.test(engineering)) {
    return { error: "Include each full question and end your selection at the end of prompt 5." };
  }

  return {
    content: {
      coverage: "needs_review",
      source_url: BOSTON_COLLEGE_SUPPLEMENT_URL,
      verified_on: null,
      notes: BOSTON_COLLEGE_GUIDANCE,
      prompts: [
        {
          prompt_key: "choice",
          title: "Boston College — Common App response choice",
          prompt_text: [directions, ...questions.slice(0, 4).map((question, index) => `${index + 1}. ${question}`)].join("\n\n"),
          word_limit: Number(wordLimit[1]),
          character_limit: null,
          requirement: "conditional",
          text_kind: "verbatim",
        },
        {
          prompt_key: "engineering",
          title: "Boston College — Human-Centered Engineering",
          prompt_text: engineering,
          word_limit: null,
          character_limit: null,
          requirement: "conditional",
          text_kind: "verbatim",
        },
        ...existing.filter(prompt => prompt.prompt_key !== "choice" && prompt.prompt_key !== "engineering"),
      ],
    },
  };
}
