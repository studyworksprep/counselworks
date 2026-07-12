-- ===========================================================================
-- Essay coaching loop (fix plan Phase 10, item 10.3)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Feedback comments: counselor ↔ student, per version, optionally anchored
-- to a text span of that version (quoted_text + character offsets).
-- ---------------------------------------------------------------------------
CREATE TABLE essay_feedback (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    essay_draft_id      uuid NOT NULL REFERENCES essay_drafts(id) ON DELETE CASCADE,
    version_number      integer NOT NULL,
    author_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    body                text NOT NULL,
    -- Inline anchoring (optional): the quoted span and its offsets within
    -- the version body. quoted_text is the durable part — offsets can drift
    -- across versions, the quote never lies about what was commented on.
    quoted_text         text,
    anchor_start        integer,
    anchor_end          integer,
    resolved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_essay_feedback_firm_id ON essay_feedback(firm_id);
CREATE INDEX idx_essay_feedback_draft ON essay_feedback(essay_draft_id, created_at);
ALTER TABLE essay_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY essay_feedback_tenant_isolation ON essay_feedback
    FOR ALL TO authenticated
    USING (firm_id = public.firm_id())
    WITH CHECK (firm_id = public.firm_id());

-- ---------------------------------------------------------------------------
-- Supplement prompt bank: firm-curated prompts, optionally tied to a
-- catalog college, used for bulk essay creation.
-- ---------------------------------------------------------------------------
CREATE TABLE essay_prompts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    college_id          uuid REFERENCES colleges(id) ON DELETE SET NULL,
    title               text NOT NULL,
    prompt_text         text NOT NULL,
    essay_type          text NOT NULL DEFAULT 'supplemental',
    word_limit          integer,
    is_active           boolean NOT NULL DEFAULT true,
    created_by_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_essay_prompts_firm_id ON essay_prompts(firm_id);
CREATE INDEX idx_essay_prompts_firm_college ON essay_prompts(firm_id, college_id);
CREATE TRIGGER trg_essay_prompts_set_updated_at
    BEFORE UPDATE ON essay_prompts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE essay_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY essay_prompts_tenant_isolation ON essay_prompts
    FOR ALL TO authenticated
    USING (firm_id = public.firm_id())
    WITH CHECK (firm_id = public.firm_id());
CREATE POLICY essay_prompts_staff_write ON essay_prompts
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (public.is_staff());
