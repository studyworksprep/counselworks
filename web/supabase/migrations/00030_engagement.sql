-- ===========================================================================
-- Engagement tracking, light (fix plan Phase 10, item 10.9)
-- ===========================================================================
-- Interview tracking + campus-visit / demonstrated-interest log directly on
-- the student-college row. Deliberately schema-light: the log is a JSON
-- array of { type, date, note } entries validated by the app layer
-- (src/lib/constants/engagement.ts). All columns optional.

ALTER TABLE student_colleges
    ADD COLUMN interview_status text
        CHECK (interview_status IN
               ('not_offered', 'to_schedule', 'scheduled', 'completed')),
    ADD COLUMN interview_at date,
    ADD COLUMN engagement_log_json jsonb;
