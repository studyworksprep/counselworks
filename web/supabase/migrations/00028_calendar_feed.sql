-- ===========================================================================
-- Read-only ICS calendar feed per counselor (fix plan Phase 10, item 10.7)
-- ===========================================================================
-- External calendar apps (Google/Apple/Outlook) subscribe with a secret,
-- rotatable token — they cannot present a Clerk session. The token gates a
-- read-only meetings feed served by /api/calendar-feed/[token].

ALTER TABLE users
    ADD COLUMN calendar_feed_token text UNIQUE;

CREATE INDEX idx_users_calendar_feed_token
    ON users(calendar_feed_token)
    WHERE calendar_feed_token IS NOT NULL;
