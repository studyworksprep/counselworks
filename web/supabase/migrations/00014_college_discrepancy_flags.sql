-- =============================================================================
-- College Scorecard bulk ingest: support for safe import
-- =============================================================================
-- * colleges gains created_via + last_scorecard_check_at so the ingest job is
--   idempotent and we can tell scorecard-imported rows apart from the original
--   manually-curated ones.
-- * college_discrepancy_flags collects proposed changes that an admin reviews
--   before they're applied. The ingest job never mutates existing colleges
--   directly — only proposes via flags.
-- =============================================================================

ALTER TABLE colleges
    ADD COLUMN IF NOT EXISTS created_via            text NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS last_scorecard_check_at timestamptz;

CREATE TABLE IF NOT EXISTS college_discrepancy_flags (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id               uuid REFERENCES colleges(id) ON DELETE CASCADE,
    kind                     text NOT NULL CHECK (kind IN ('field_diff', 'potential_duplicate')),
    field_name               text,
    current_value            text,
    proposed_value           text,
    proposed_scorecard_id    integer,
    source                   text NOT NULL DEFAULT 'scorecard_ingest',
    claude_classification    text CHECK (claude_classification IN ('meaningful', 'cosmetic')),
    claude_assessment        text,
    status                   text NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by_user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at              timestamptz,
    applied_at               timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_college_discrepancy_flags_status
    ON college_discrepancy_flags(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_college_discrepancy_flags_college_id
    ON college_discrepancy_flags(college_id);

ALTER TABLE college_discrepancy_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY college_discrepancy_flags_read_authenticated
    ON college_discrepancy_flags
    FOR SELECT USING (true);
