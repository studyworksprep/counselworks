import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  activeQuestions,
  defaultAnswerAudience,
  readableResponse,
  validateStructuredResponse,
} from "@/lib/interview/conversation";
import { fitPreferences } from "@/lib/interview/fit";
import { scoreCollegeWithInterview } from "@/lib/colleges/recommendation";
import {
  questionFor,
  STUDENT_QUESTIONS,
  type InterviewAnswer,
  type StructuredResponse,
} from "@/lib/interview/template";
const payload = (
  optionIds: string[],
  importance: StructuredResponse["importance"] = "preference",
): StructuredResponse => ({ version: 2, optionIds, text: "", importance });
const answer = (
  key: string,
  options: string[],
  extra: Partial<InterviewAnswer> = {},
): InterviewAnswer => ({
  id: key,
  student_id: "student",
  respondent_user_id: "student-user",
  respondent_kind: "student",
  question_key: key,
  template_version: 2,
  structured_response: payload(options),
  discussion_requested: false,
  answer: options.join(", "),
  state: "answered",
  audience: "family",
  revision: 1,
  updated_at: "2026-11-17",
  ...extra,
});
describe("conversational responses", () => {
  it("defaults only new student answers to family, preserving every prior audience", () => {
    expect(defaultAnswerAudience("student")).toBe("family");
    expect(defaultAnswerAudience("parent")).toBe("counselor");
    expect(defaultAnswerAudience("student", { audience: "counselor" })).toBe(
      "counselor",
    );
    expect(defaultAnswerAudience("parent", { audience: "family" })).toBe(
      "family",
    );
  });
  it("validates option ownership, exclusivity, single choices and ranked duplicates", () => {
    expect(
      validateStructuredResponse(
        questionFor("FIT_SIZE", "student")!,
        payload(["city"]),
        "answered",
      ),
    ).toBeTruthy();
    expect(
      validateStructuredResponse(
        questionFor("FIT_SIZE", "student")!,
        payload(["small", "flexible"]),
        "answered",
      ),
    ).toBeTruthy();
    expect(
      validateStructuredResponse(
        questionFor("P1", "student")!,
        payload(["cost", "cost"]),
        "answered",
      ),
    ).toBeTruthy();
    expect(
      validateStructuredResponse(
        questionFor("A3", "student")!,
        payload(["focused", "exploring"]),
        "answered",
      ),
    ).toBeTruthy();
    expect(
      validateStructuredResponse(
        questionFor("FIT_SIZE", "student")!,
        payload(["small", "medium"]),
        "answered",
      ),
    ).toBeNull();
  });
  it("distinguishes uncertainty, deferral, decline and a flexible answer from preferences", () => {
    const q = questionFor("FIT_SIZE", "student")!;
    expect(validateStructuredResponse(q, payload([]), "answered")).toBeTruthy();
    for (const state of ["unsure", "deferred", "declined"])
      expect(validateStructuredResponse(q, payload([]), state)).toBeNull();
    expect(
      validateStructuredResponse(q, payload(["undecided"]), "answered"),
    ).toBeTruthy();
    expect(
      validateStructuredResponse(q, payload(["flexible"]), "answered"),
    ).toBeNull();
  });
  it("branches only on current structured answers, never old free text or a declined topic", () => {
    expect(
      activeQuestions("student", []).some(
        (q) => q.key === "FIT_PROGRAM_DETAIL",
      ),
    ).toBe(false);
    expect(
      activeQuestions("student", [answer("A3", ["focused"])]).some(
        (q) => q.key === "FIT_PROGRAM_DETAIL",
      ),
    ).toBe(true);
    for (const a of [
      answer("A3", [], {
        template_version: 1,
        structured_response: null,
        answer: "focused",
      }),
      answer("A3", ["focused"], { state: "declined" }),
    ])
      expect(
        activeQuestions("student", [a]).some(
          (q) => q.key === "FIT_PROGRAM_DETAIL",
        ),
      ).toBe(false);
  });
  it("gives existing consumers a readable answer without turning a discussion flag into an answer state", () => {
    const a = answer("FIT_SIZE", ["small"], { discussion_requested: true });
    expect(
      readableResponse(
        questionFor(a.question_key, "student")!,
        a.structured_response!,
      ),
    ).toContain("Under 5,000 undergraduates");
    expect(fitPreferences([a])[0].status).toBe("Answered");
  });
  it("ships matching database definitions for every v2 student option", () => {
    const sql = readFileSync(
      "supabase/migrations/00065_conversational_interview.sql",
      "utf8",
    );
    const definitions = [
      ...sql.matchAll(/\(\'([^\']+)\',2,\'((?:[^\']|\'\')+)\'::jsonb\)/g),
    ].map((m) => JSON.parse(m[2].replaceAll("''", "'")));
    for (const q of STUDENT_QUESTIONS) expect(definitions).toContainEqual(q);
  });
});
describe("structured college-fit overlay", () => {
  const smallTown = {
    undergraduate_size: 3000,
    locale_type: "Town",
    state_region: "MA",
    institution_type: "Public",
  };
  const largeCity = {
    undergraduate_size: 24000,
    locale_type: "City",
    state_region: "CA",
    institution_type: "Private nonprofit",
  };
  it("changes ranking with direct, sourced size and setting preferences", () => {
    const prefs = fitPreferences([
      answer("FIT_SIZE", ["small"]),
      answer("FIT_SETTING", ["town"]),
    ]);
    expect(
      scoreCollegeWithInterview(null, smallTown, prefs).score,
    ).toBeGreaterThan(scoreCollegeWithInterview(null, largeCity, prefs).score);
    const comparison = scoreCollegeWithInterview(null, largeCity, prefs)
      .fitComparisons[0];
    expect(comparison).toMatchObject({
      answerId: "FIT_SIZE",
      revision: 1,
      version: 2,
      status: "mismatch",
    });
  });
  it("leaves unknown data unverified, including requirements", () => {
    const prefs = fitPreferences([
      answer("FIT_SIZE", ["small"], {
        structured_response: payload(["small"], "requirement"),
      }),
    ]);
    expect(scoreCollegeWithInterview(null, {}, prefs)).toMatchObject({
      score: 0,
      requirementMismatches: 0,
      fitComparisons: [{ status: "unknown" }],
    });
    expect(
      scoreCollegeWithInterview(null, largeCity, prefs).requirementMismatches,
    ).toBe(1);
  });
  it("never scores parent answers, legacy prose, scenarios or uncertain preferences", () => {
    const a = answer("FIT_SIZE", ["small"]);
    for (const source of [
      { ...a, respondent_kind: "parent" as const },
      { ...a, template_version: 1, structured_response: null },
      { ...a, state: "unsure" as const },
      { ...a, state: "deferred" as const },
      { ...a, state: "declined" as const },
      answer("FIT_FRIDAY", ["event"]),
    ])
      expect(
        scoreCollegeWithInterview(null, smallTown, fitPreferences([source]))
          .score,
      ).toBe(0);
  });
  it("honors flexibility without scoring a stale profile preference, and explains conflicts without overwriting it", () => {
    const profile = {
      geographic_preferences: ["CA"],
      target_school_type: "private",
    };
    const before = JSON.stringify(profile);
    const flexible = fitPreferences([answer("FIT_STATES", ["flexible"])]);
    expect(
      scoreCollegeWithInterview(profile, { state_region: "CA" }, flexible)
        .score,
    ).toBe(0);
    const direct = fitPreferences([answer("FIT_STATES", ["MA"])]);
    expect(
      scoreCollegeWithInterview(
        profile,
        { state_region: "MA" },
        direct,
      ).fitComparisons.some((c) => c.status === "conflict"),
    ).toBe(true);
    expect(JSON.stringify(profile)).toBe(before);
  });
  it("uses exact size boundaries and neutral school-type matches", () => {
    const prefs = fitPreferences([
      answer("FIT_SIZE", ["medium"]),
      answer("FIT_TYPE", ["private"]),
    ]);
    for (const size of [5000, 15000])
      expect(
        scoreCollegeWithInterview(
          null,
          { undergraduate_size: size, institution_type: "Private nonprofit" },
          prefs,
        ).fitComparisons.every((c) => c.status === "match"),
      ).toBe(true);
    expect(
      scoreCollegeWithInterview(
        null,
        { institution_type: "Private for-profit" },
        prefs,
      ).fitComparisons.find((c) => c.criterion === "type")?.status,
    ).toBe("mismatch");
  });
});
