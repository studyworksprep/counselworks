-- ===========================================================================
-- Student profile personalization + intake (fix plan Phase 4)
-- ===========================================================================
-- The recommendation scorer and college fit analysis have always read
-- sat_score / act_score / geographic_preferences / financial_aid_needed /
-- target_school_type from student_profiles — columns that never existed, so
-- recommendations silently de-personalized and fit analysis errored out.
-- This adds the missing columns plus intake-submission tracking.
-- testing_summary_json remains the detailed score history; sat_score and
-- act_score hold the current best composite used for matching.

ALTER TABLE student_profiles
    ADD COLUMN sat_score               int CHECK (sat_score BETWEEN 400 AND 1600),
    ADD COLUMN act_score               int CHECK (act_score BETWEEN 1 AND 36),
    ADD COLUMN geographic_preferences  jsonb,
    ADD COLUMN financial_aid_needed    boolean,
    ADD COLUMN target_school_type      text,
    ADD COLUMN intake_submitted_at     timestamptz,
    ADD COLUMN intake_submitted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Portal self-service intake
-- ---------------------------------------------------------------------------
-- 00016 made student_profiles staff-write. Intake lets the student update
-- their own profile and parents update their children's; the app layer
-- (submitStudentIntake / submitParentIntake) whitelists which columns each
-- role may touch — counselor-private fields (strategy notes, ratings, risk
-- flags) are never in a portal write path.
CREATE POLICY student_profiles_self_update ON student_profiles
    FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM students s
        WHERE s.id = student_profiles.student_id
          AND s.firm_id = public.firm_id()
          AND s.user_id = public.current_user_id()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM students s
        WHERE s.id = student_profiles.student_id
          AND s.firm_id = public.firm_id()
          AND s.user_id = public.current_user_id()
    ));

CREATE POLICY student_profiles_parent_update ON student_profiles
    FOR UPDATE
    USING (EXISTS (
        SELECT 1
        FROM students s
        JOIN family_members fm ON fm.family_id = s.family_id
        WHERE s.id = student_profiles.student_id
          AND s.firm_id = public.firm_id()
          AND fm.firm_id = public.firm_id()
          AND fm.user_id = public.current_user_id()
    ))
    WITH CHECK (EXISTS (
        SELECT 1
        FROM students s
        JOIN family_members fm ON fm.family_id = s.family_id
        WHERE s.id = student_profiles.student_id
          AND s.firm_id = public.firm_id()
          AND fm.firm_id = public.firm_id()
          AND fm.user_id = public.current_user_id()
    ));
