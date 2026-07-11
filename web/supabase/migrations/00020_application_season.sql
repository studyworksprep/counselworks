-- ===========================================================================
-- Application season completeness (fix plan Phase 5)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Normalize application_type to the short round codes
-- ---------------------------------------------------------------------------
-- Two creation paths historically wrote different spellings (early_action vs
-- ea), breaking workflow deadline anchors (which match short codes) and
-- kanban labels (which knew long codes). Short codes are canonical — the
-- same enum student_colleges.round_type uses. The shared constants module
-- (src/lib/constants/applications.ts) is the single source of truth.
UPDATE applications SET application_type = CASE application_type
    WHEN 'regular'                 THEN 'rd'
    WHEN 'early_action'            THEN 'ea'
    WHEN 'early_decision'          THEN 'ed'
    WHEN 'early_decision_ii'       THEN 'ed2'
    WHEN 'restrictive_early_action' THEN 'rea'
    ELSE application_type
END
WHERE application_type IN (
    'regular', 'early_action', 'early_decision',
    'early_decision_ii', 'restrictive_early_action'
);

ALTER TABLE applications
    ADD CONSTRAINT applications_type_check
    CHECK (application_type IN ('ea', 'ed', 'ed2', 'rea', 'rd', 'rolling'));

-- ---------------------------------------------------------------------------
-- 2. Recommender tracking (light)
-- ---------------------------------------------------------------------------
-- One row per recommender per student with a single lifecycle status —
-- matching the Common App model where a letter is written once and shared
-- across colleges. Complements the "Recommendation Letters" workflow
-- template with actual people and states.
CREATE TABLE recommenders (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_id          uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    name                text NOT NULL,
    role_title          text,
    email               text,
    status              text NOT NULL DEFAULT 'identified'
                        CHECK (status IN ('identified', 'asked', 'accepted', 'submitted', 'declined')),
    notes               text,
    created_by_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recommenders_firm_id ON recommenders(firm_id);
CREATE INDEX idx_recommenders_firm_id_student_id ON recommenders(firm_id, student_id);

CREATE TRIGGER trg_recommenders_set_updated_at
    BEFORE UPDATE ON recommenders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE recommenders ENABLE ROW LEVEL SECURITY;

CREATE POLICY recommenders_member_read ON recommenders
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY recommenders_staff_write ON recommenders
    FOR ALL
    USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());

-- ---------------------------------------------------------------------------
-- 3. Student essay editing (the Phase 5 relaxation promised in 00016)
-- ---------------------------------------------------------------------------
-- Students may edit their own drafts when the draft is shared with them
-- (visibility student/family); staff keep full write access via the
-- existing staff policy. Version snapshots follow the same rule.
CREATE POLICY essay_drafts_student_update ON essay_drafts
    FOR UPDATE
    USING (
        visibility_scope IN ('student', 'family')
        AND EXISTS (
            SELECT 1 FROM students s
            WHERE s.id = essay_drafts.student_id
              AND s.firm_id = public.firm_id()
              AND s.user_id = public.current_user_id()
        )
    )
    WITH CHECK (
        visibility_scope IN ('student', 'family')
        AND EXISTS (
            SELECT 1 FROM students s
            WHERE s.id = essay_drafts.student_id
              AND s.firm_id = public.firm_id()
              AND s.user_id = public.current_user_id()
        )
    );

CREATE POLICY essay_draft_versions_student_insert ON essay_draft_versions
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1
        FROM essay_drafts e
        JOIN students s ON s.id = e.student_id
        WHERE e.id = essay_draft_versions.essay_draft_id
          AND e.firm_id = public.firm_id()
          AND e.visibility_scope IN ('student', 'family')
          AND s.user_id = public.current_user_id()
    ));
