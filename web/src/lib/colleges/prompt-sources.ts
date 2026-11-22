import { BOSTON_COLLEGE_SUPPLEMENT_URL } from "./prompt-import";

export const supplementSources: Readonly<Record<number, string>> = {
  164924: BOSTON_COLLEGE_SUPPLEMENT_URL,
  130794: "https://admissions.yale.edu/essay-topics",
  186131: "https://admission.princeton.edu/apply/princeton-specific-questions",
};

export type SourceCheck = { checked_at: string; source_text: string; issue: string };
