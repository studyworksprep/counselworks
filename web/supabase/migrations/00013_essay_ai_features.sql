-- =============================================================================
-- AI-assisted supplement essay support
-- =============================================================================
-- * essay_drafts gains a stored prompt analysis (the structured output from
--   Claude when a counselor or student clicks "Analyze prompt") plus the
--   denormalized prompt_type / word_count_limit it extracts.
-- * essay_ai_suggestions stores per-run brainstorm, outline, and coach-review
--   results so they persist across page loads and are auditable.
-- * ai_usage_events records token usage per call for per-firm cost tracking.
-- =============================================================================

ALTER TABLE essay_drafts
    ADD COLUMN IF NOT EXISTS prompt_analysis    jsonb,
    ADD COLUMN IF NOT EXISTS prompt_analysis_at timestamptz,
    ADD COLUMN IF NOT EXISTS prompt_type        text,
    ADD COLUMN IF NOT EXISTS word_count_limit   int;

CREATE TABLE IF NOT EXISTS essay_ai_suggestions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    essay_draft_id      uuid NOT NULL REFERENCES essay_drafts(id) ON DELETE CASCADE,
    kind                text NOT NULL CHECK (kind IN ('brainstorm', 'outline', 'coach_review')),
    content             jsonb NOT NULL,
    created_by_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_essay_ai_suggestions_essay_draft_id
    ON essay_ai_suggestions(essay_draft_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_essay_ai_suggestions_firm_id
    ON essay_ai_suggestions(firm_id);

ALTER TABLE essay_ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY essay_ai_suggestions_tenant_access ON essay_ai_suggestions
    USING (firm_id = public.firm_id());

CREATE TABLE IF NOT EXISTS ai_usage_events (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    feature                     text NOT NULL,
    model                       text NOT NULL,
    input_tokens                int NOT NULL DEFAULT 0,
    output_tokens               int NOT NULL DEFAULT 0,
    cache_creation_input_tokens int NOT NULL DEFAULT 0,
    cache_read_input_tokens     int NOT NULL DEFAULT 0,
    essay_draft_id              uuid REFERENCES essay_drafts(id) ON DELETE SET NULL,
    created_by_user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_firm_id_created_at
    ON ai_usage_events(firm_id, created_at DESC);

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_events_tenant_access ON ai_usage_events
    USING (firm_id = public.firm_id());
