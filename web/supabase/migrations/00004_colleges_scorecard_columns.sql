-- ===========================================================================
-- Add College Scorecard data columns to colleges table
-- ===========================================================================

ALTER TABLE colleges
    ADD COLUMN IF NOT EXISTS scorecard_id        integer,
    ADD COLUMN IF NOT EXISTS acceptance_rate      numeric(5,4),
    ADD COLUMN IF NOT EXISTS sat_avg              integer,
    ADD COLUMN IF NOT EXISTS act_avg              integer,
    ADD COLUMN IF NOT EXISTS undergraduate_size   integer,
    ADD COLUMN IF NOT EXISTS tuition_in_state     integer,
    ADD COLUMN IF NOT EXISTS tuition_out_state    integer,
    ADD COLUMN IF NOT EXISTS net_price_avg        integer,
    ADD COLUMN IF NOT EXISTS graduation_rate      numeric(5,4),
    ADD COLUMN IF NOT EXISTS retention_rate       numeric(5,4),
    ADD COLUMN IF NOT EXISTS earnings_median_10yr integer,
    ADD COLUMN IF NOT EXISTS median_debt          integer,
    ADD COLUMN IF NOT EXISTS federal_loan_rate    numeric(5,4),
    ADD COLUMN IF NOT EXISTS locale_type          text,
    ADD COLUMN IF NOT EXISTS institution_type     text,
    ADD COLUMN IF NOT EXISTS scorecard_synced_at  timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_colleges_scorecard_id ON colleges(scorecard_id)
    WHERE scorecard_id IS NOT NULL;
