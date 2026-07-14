-- ===========================================================================
-- Firm-wide calendar-feed control (fix plan Phase 11, item 11.5)
-- ===========================================================================
-- Above the per-counselor ICS token (00028), an admin can disable calendar
-- feeds for the whole firm. When off, /api/calendar-feed/[token] stops
-- resolving for every token in the firm (existing subscriptions go stale
-- immediately) and staff cannot enable or rotate their own feed.

ALTER TABLE firm_settings
    ADD COLUMN calendar_feeds_enabled boolean NOT NULL DEFAULT true;
