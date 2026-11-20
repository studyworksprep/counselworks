import { timingSafeEqual } from "node:crypto";
import { qualityReviewCases } from "./cases";
import { executeQualityCase } from "./run-case";

export const REVIEW_BRANCH = "codex/ai-quality-live-run";
/** Not mounted in the application. A disposable preview can re-export this
 * handler for a bounded review, then delete that deployment and its token.
 * The only inputs are fixed fictional case IDs; there is no database client,
 * free-form prompt, student ID, credential response or production execution. */
export async function previewQualityReview(request: Request) {
  const expected = process.env.CW_AI_REVIEW_TOKEN;
  const supplied = request.headers.get("x-cw-ai-review-token");
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== REVIEW_BRANCH ||
    !expected ||
    expected.length < 32 ||
    !supplied ||
    Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  ) {
    return new Response(null, { status: 404 });
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (
    !input ||
    typeof input !== "object" ||
    !("id" in input) ||
    typeof input.id !== "string" ||
    Object.keys(input).length !== 1 ||
    !qualityReviewCases.some((c) => c.id === input.id)
  ) {
    return new Response(null, { status: 400 });
  }
  const record = await executeQualityCase(input.id);
  return Response.json(record, { headers: { "Cache-Control": "no-store" } });
}
