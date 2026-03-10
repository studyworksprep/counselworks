-- ===========================================================================
-- Add US News ranking columns to colleges table
-- ===========================================================================

ALTER TABLE colleges
    ADD COLUMN IF NOT EXISTS usnews_national_rank       integer,
    ADD COLUMN IF NOT EXISTS usnews_liberal_arts_rank    integer,
    ADD COLUMN IF NOT EXISTS usnews_business_rank        integer;
