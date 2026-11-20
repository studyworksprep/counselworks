import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qualityCases, qualityReviewCases } from "../ai-quality/cases";
import { selectStudentContext } from "@/lib/ai/student-context";
import { selectEssaySources } from "@/lib/ai/essay-context";

const execution = vi.hoisted(() => vi.fn());
vi.mock("../ai-quality/run-case", () => ({ executeQualityCase: execution }));
import {
  previewQualityReview,
  REVIEW_BRANCH,
} from "../ai-quality/preview-handler";
const token = "fictional-test-token-".repeat(3);
const request = (
  body: unknown = { id: qualityCases[0].id },
  supplied = token,
) =>
  new Request("https://fictional-review.invalid/api/quality-review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cw-ai-review-token": supplied,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", REVIEW_BRANCH);
  vi.stubEnv("CW_AI_REVIEW_TOKEN", token);
  execution.mockResolvedValue({ id: qualityCases[0].id, contract: "accepted" });
});
afterEach(() => vi.unstubAllEnvs());

describe("fictional AI quality corpus", () => {
  it("has sixteen unique cases across the existing generation modes", () => {
    expect(qualityCases).toHaveLength(16);
    expect(new Set(qualityCases.map((c) => c.id)).size).toBe(16);
    expect(new Set(qualityReviewCases.map((c) => c.id)).size).toBe(
      qualityReviewCases.length,
    );
    expect(
      new Set(
        qualityCases.map((c) => (c.kind === "coaching" ? c.kind : c.mode)),
      ),
    ).toEqual(
      new Set([
        "questions",
        "story",
        "narrative",
        "strategy",
        "story_matches",
        "outline",
        "coaching",
      ]),
    );
  });
  it.each(qualityReviewCases)(
    "$id uses valid explicit source selections and actual questionnaire keys",
    (c) => {
      const selected =
        c.kind === "interview"
          ? selectStudentContext(c.context, c.mode, c.refs)
          : selectEssaySources(c.workspace.sources, c.refs);
      expect(selected).toHaveLength(c.refs.length);
      if (c.kind === "interview" && c.mode === "questions") {
        expect(c.questions.length).toBeGreaterThan(0);
        expect(
          c.questions.some((q) =>
            c.context.excludedQuestionKeys.includes(q.key),
          ),
        ).toBe(false);
      }
    },
  );
});
describe("unmounted, disposable preview review handler", () => {
  it.each(["production", "development"])(
    "never runs in %s",
    async (environment) => {
      vi.stubEnv("VERCEL_ENV", environment);
      expect((await previewQualityReview(request())).status).toBe(404);
      expect(execution).not.toHaveBeenCalled();
    },
  );
  it("requires the exact review branch and a separate adequate token", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    expect((await previewQualityReview(request())).status).toBe(404);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", REVIEW_BRANCH);
    expect(
      (await previewQualityReview(request(undefined, "wrong"))).status,
    ).toBe(404);
    vi.stubEnv("CW_AI_REVIEW_TOKEN", "");
    expect((await previewQualityReview(request())).status).toBe(404);
    expect(execution).not.toHaveBeenCalled();
  });
  it.each([
    { id: "arbitrary" },
    { id: qualityCases[0].id, prompt: "arbitrary text" },
    null,
  ])("rejects arbitrary prompts or unknown cases", async (body) => {
    expect((await previewQualityReview(request(body))).status).toBe(400);
    expect(execution).not.toHaveBeenCalled();
  });
  it("returns only the predefined review record and disables caching", async () => {
    const response = await previewQualityReview(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      id: qualityCases[0].id,
      contract: "accepted",
    });
    expect(execution).toHaveBeenCalledWith(qualityCases[0].id);
  });
});
