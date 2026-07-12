-- ===========================================================================
-- Aid awards & testing plan (fix plan Phase 10, item 10.6)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Scholarship / aid awards per application. Amounts are annual whole USD.
-- ---------------------------------------------------------------------------
CREATE TABLE aid_awards (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    application_id      uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    student_id          uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    kind                text NOT NULL
                        CHECK (kind IN ('merit', 'need', 'loan', 'work_study', 'other')),
    name                text NOT NULL,
    annual_amount       integer NOT NULL CHECK (annual_amount >= 0),
    renewable           boolean NOT NULL DEFAULT true,
    notes               text,
    created_by_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_aid_awards_firm_id ON aid_awards(firm_id);
CREATE INDEX idx_aid_awards_firm_application ON aid_awards(firm_id, application_id);
CREATE INDEX idx_aid_awards_firm_student ON aid_awards(firm_id, student_id);
CREATE TRIGGER trg_aid_awards_set_updated_at
    BEFORE UPDATE ON aid_awards
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE aid_awards ENABLE ROW LEVEL SECURITY;
-- Family financial data the family itself provided: portal roles read
-- (app layer narrows to own student/family), staff write.
CREATE POLICY aid_awards_member_read ON aid_awards
    FOR SELECT TO authenticated
    USING (firm_id = public.firm_id());
CREATE POLICY aid_awards_staff_write ON aid_awards
    FOR ALL TO authenticated
    USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());

-- Cost of attendance from the award letter (annual whole USD). When absent,
-- net-cost comparisons fall back to the catalog tuition estimate.
ALTER TABLE applications
    ADD COLUMN cost_of_attendance integer CHECK (cost_of_attendance >= 0);

-- ---------------------------------------------------------------------------
-- Testing plan: planned/registered SAT-ACT-etc. sittings per student.
-- Complements student_profiles.testing_summary_json (free-form history).
-- ---------------------------------------------------------------------------
CREATE TABLE test_sittings (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_id             uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    test_type              text NOT NULL
                           CHECK (test_type IN ('sat', 'act', 'psat', 'ap', 'ib', 'toefl', 'other')),
    test_date              date,
    registration_deadline  date,
    status                 text NOT NULL DEFAULT 'planned'
                           CHECK (status IN ('planned', 'registered', 'completed', 'cancelled')),
    score                  text,
    notes                  text,
    created_by_user_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_test_sittings_firm_id ON test_sittings(firm_id);
CREATE INDEX idx_test_sittings_firm_student ON test_sittings(firm_id, student_id);
CREATE TRIGGER trg_test_sittings_set_updated_at
    BEFORE UPDATE ON test_sittings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE test_sittings ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_sittings_member_read ON test_sittings
    FOR SELECT TO authenticated
    USING (firm_id = public.firm_id());
CREATE POLICY test_sittings_staff_write ON test_sittings
    FOR ALL TO authenticated
    USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());
