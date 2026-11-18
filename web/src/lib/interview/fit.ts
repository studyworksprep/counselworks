import { questionFor, type InterviewAnswer } from "./template";
import { answerStatus, responseIsActive } from "./conversation";

export type FitPreference = {
  questionKey: string;
  answerId: string;
  revision: number;
  version: 2;
  criterion: string;
  options: string[];
  importance: "preference" | "important" | "requirement";
  status: string;
  text: string;
  respondentId: string;
  respondentKind: "student" | "parent";
};
export const SUPPORTED_CRITERIA = ["size", "setting", "states", "type"];
export const CRITERION_GAPS: Record<string, string> = {
  distance:
    "Travel time and distance from home are not available in the catalog.",
  social: "The catalog does not verify social life or Friday activities.",
  community: "Community and belonging need research with the student.",
  learning: "Classroom and teaching style are not verified in the catalog.",
  activities: "Activities and access to them need college-specific research.",
  cost: "Average net price is not a personal aid offer or an affordability guarantee.",
  support: "Support services and eligibility need direct verification.",
  program: "Program availability and entry requirements need verification.",
  requirements: "Practical requirements need counselor verification.",
  tradeoffs:
    "This scenario starts a discussion; it does not establish a college requirement.",
};
/** Only direct, current student responses affect scoring. No free-text classification. */
export function fitPreferences(answers: InterviewAnswer[]): FitPreference[] {
  return answers.flatMap((a) => {
    const q = questionFor(a.question_key, a.respondent_kind),
      s = a.structured_response;
    if (
      !q?.criterion ||
      a.template_version !== 2 ||
      !s ||
      !responseIsActive(a, answers)
    )
      return [];
    return [
      {
        questionKey: a.question_key,
        answerId: a.id,
        revision: a.revision,
        version: 2 as const,
        criterion: q.criterion,
        options: s.optionIds,
        importance: s.importance,
        status: answerStatus(a),
        text: a.answer,
        respondentId: a.respondent_user_id,
        respondentKind: a.respondent_kind,
      },
    ];
  });
}
export function usableFitPreference(p: FitPreference) {
  return (
    ["Answered"].includes(p.status) &&
    p.options.length > 0 &&
    !p.options.some((id) =>
      ["flexible", "undecided", "depends", "other"].includes(id),
    )
  );
}
