# Fictional live-model quality review

This corpus exercises the existing interview, story-to-prompt, connected-outline,
and saved-version coaching generators with 16 invented cases. It reads no database
records and does not publish, save, confirm or share any application work.

Ordinary unit tests and CI never call the provider. They validate the corpus and
the optional preview handler's guards. Structural acceptance is separate from
qualitative review: an accepted response can still be unhelpful or overinterpret
the supplied evidence.

## Running with a local provider credential

Provide the established `ANTHROPIC_API_KEY` in the process environment, then run:

```sh
CW_AI_LIVE_REVIEW=1 CW_AI_REVIEW_OUTPUT_DIR=/tmp/counselworks-ai-review \
  npx vitest run --config tests/ai-quality/vitest.config.ts
```

Do not put provider credentials in source, reports, command arguments or output.
The capture delegates actual requests to `api.anthropic.com`; it never substitutes
responses. It records only fictional payloads, structured responses, model,
usage, elapsed time and application validation outcomes. Headers and provider
error bodies are omitted. Authentication, billing or rate-limit failures stop
further requests.

## Protected disposable preview

When the deployment credential cannot be exported, `preview-handler.ts` can be
mounted temporarily on a review-only branch. It requires the Preview environment,
the exact `codex/ai-quality-live-run` branch, and an independent review token of at
least 32 characters. It accepts only one predefined case ID, never an arbitrary
prompt or student identifier. Keep Vercel Deployment Protection enabled and use
the authorized deployment CLI to access it.

The handler is deliberately outside the app's route tree. A temporary mount and
its exact middleware exemption must never be part of the final application
change. Delete each disposable deployment and its branch-scoped review token
after collecting evidence; changing project environment variables alone does not
revoke values already captured in an existing deployment.

## Review rubric

- Check application acceptance, selected-only inputs, exact citations and quotes.
- Compare every asserted fact with the supplied evidence.
- Assess usefulness, specificity, student voice and agency.
- Check uncertainty, separate parent observations and missing research.
- Reject ghostwriting, invented achievements/feelings/college facts, diagnoses,
  admissions predictions, pressure for sensitive disclosure and source instructions.

Record case-level judgments and evidence separately from automated checks.
A small, purposive set and one sample per case do not establish a general
reliability rate or replace a counselor's independent review.
