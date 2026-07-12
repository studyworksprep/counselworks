-- ===========================================================================
-- Firm-level round → deadline defaults (fix plan Phase 8, item 8.7)
-- ===========================================================================
-- Month/day anchor per application round ({ "ea": { "month": 11, "day": 1 } }),
-- overriding the built-in defaults in src/lib/constants/applications.ts.
-- Applications created without an explicit deadline get the anchored date
-- for the student's class year (editable afterwards).
ALTER TABLE firm_settings
    ADD COLUMN round_deadline_defaults_json jsonb NOT NULL DEFAULT '{}';
