import { z } from "zod";
import {
  questionFor,
  questionsFor,
  type InterviewAnswer,
  type InterviewQuestion,
  type StructuredResponse,
} from "./template";

export const IMPORTANCE_LABELS = {
  preference: "A preference — I can be flexible",
  important: "Important — worth weighing carefully",
  requirement: "A requirement — please check this",
} as const;
export const structuredResponseSchema = z
  .object({
    version: z.literal(2),
    optionIds: z.array(z.string().max(80)).max(54),
    text: z.string().trim().max(6000),
    importance: z.enum(["preference", "important", "requirement"]),
  })
  .strict();
export const NEW_ANSWER_STATES = [
  "answered",
  "unsure",
  "deferred",
  "declined",
] as const;
const exclusive = ["flexible", "undecided"];
export function validateStructuredResponse(
  question: InterviewQuestion,
  response: StructuredResponse,
  state: string,
) {
  const ids = response.optionIds,
    allowed = new Set(question.options?.map((o) => o.id));
  if (new Set(ids).size !== ids.length || ids.some((id) => !allowed.has(id)))
    return "Choose each available option only once.";
  if (
    (question.format === "single" || question.format === "confirm") &&
    ids.length > 1
  )
    return "Choose one option.";
  if (question.format === "rank" && ids.length > 3)
    return "Choose up to three priorities.";
  if (question.format === "text" && ids.length)
    return "Use a short written response for this question.";
  if (ids.some((id) => exclusive.includes(id)) && ids.length > 1)
    return "Choose a preference or an open option, separately.";
  if (
    state === "answered" &&
    (ids.includes("undecided") || (!ids.length && !response.text))
  )
    return "Add a response or choose still figuring it out.";
  if (state === "answered" && question.format !== "text" && !ids.length)
    return "Choose an option or come back to this.";
  if (
    state === "answered" &&
    question.format === "confirm" &&
    ids.includes("correction") &&
    !response.text
  )
    return "Add the update you want your counselor to check.";
  return null;
}
/** Stored alongside the structured payload for stories, briefs, essays and AI context. */
export function readableResponse(
  question: InterviewQuestion,
  response: StructuredResponse,
) {
  const labels = response.optionIds.map(
    (id, i) =>
      `${question.format === "rank" ? `${i + 1}. ` : ""}${question.options?.find((o) => o.id === id)?.label ?? id}`,
  );
  return [
    ...labels,
    response.text,
    ...(question.criterion && (labels.length > 0 || response.text)
      ? [IMPORTANCE_LABELS[response.importance]]
      : []),
  ]
    .filter(Boolean)
    .join("\n");
}
export function activeQuestions(
  kind: "student" | "parent",
  answers: InterviewAnswer[],
) {
  return questionsFor(kind).filter(
    (q) =>
      !q.branch ||
      answers.some(
        (a) =>
          a.question_key === q.branch!.question &&
          ["answered", "unsure"].includes(a.state) &&
          a.structured_response?.optionIds.some((id) =>
            q.branch!.options.includes(id),
          ),
      ),
  );
}
export function responseIsActive(
  answer: InterviewAnswer,
  answers: InterviewAnswer[],
) {
  const q = questionFor(answer.question_key, answer.respondent_kind);
  return (
    !q?.branch ||
    activeQuestions(
      answer.respondent_kind,
      answers.filter((a) => a.respondent_user_id === answer.respondent_user_id),
    ).some((q) => q.key === answer.question_key)
  );
}
export function defaultAnswerAudience(
  kind: "student" | "parent",
  answer?: Pick<InterviewAnswer, "audience">,
) {
  return answer?.audience ?? (kind === "student" ? "family" : "counselor");
}
export function answerStatus(answer?: InterviewAnswer) {
  if (!answer) return "Unanswered";
  if (answer.state === "answered")
    return answer.structured_response?.optionIds.includes("flexible")
      ? "Flexible"
      : "Answered";
  return {
    unsure: "Still figuring it out",
    deferred: "Come back to this",
    declined: "Chose not to answer",
    skip: "Legacy: skipped",
    discuss: "Legacy: counselor discussion",
  }[answer.state];
}
export const TOPIC_INTROS: Record<string, { title: string; intro: string }> = {
  A: {
    title: "A familiar starting point",
    intro:
      "Let's start with what we already know. You can confirm it or add an update.",
  },
  I: {
    title: "What matters to you",
    intro:
      "You do not need a settled plan. Let's start with what you want to make room for.",
  },
  FIT: {
    title: "Picture a place",
    intro:
      "Think about an ordinary day at college. Different places can work for different reasons.",
  },
  LIFE: {
    title: "Your everyday life",
    intro:
      "These situations help us start a conversation. They do not define your personality or decide your college list.",
  },
  PLAN: {
    title: "Making it workable",
    intro:
      "Let's look at support, practical limits and where you can be flexible. Share only what helps us plan.",
  },
  B: {
    title: "Learning at school",
    intro:
      "There is more to your school experience than a transcript. A few examples are enough.",
  },
  C: {
    title: "Following your curiosity",
    intro:
      "Small interests count. Tell us about whatever has caught your attention.",
  },
  D: {
    title: "Where your time goes",
    intro: "Work, care for others, hobbies and quiet projects all belong here.",
  },
  E: {
    title: "Your world",
    intro:
      "You choose what you want us to understand about home and community.",
  },
  F: {
    title: "Things that changed",
    intro:
      "You never need to share a difficult experience to complete this conversation. You can decline any personal question.",
  },
  G: {
    title: "Being yourself",
    intro:
      "There are no impressive answers to aim for. Think about the everyday version of you.",
  },
  H: {
    title: "Small moments, real stories",
    intro:
      "A place, an object or an ordinary afternoon can be a useful starting point. Notes are welcome.",
  },
  J: {
    title: "Your boundaries and next steps",
    intro:
      "Let's check what you want to carry into applications and what you want to keep out.",
  },
  REVIEW: {
    title: "Looking ahead, together",
    intro:
      "Check what you want to carry into applications, what needs more conversation and what you want to keep private.",
  },
  R: {
    title: "Your perspective as a parent",
    intro:
      "Your observations stay separate from your student's answers. Your sharing choices remain your own.",
  },
};
