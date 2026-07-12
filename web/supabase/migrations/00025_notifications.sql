-- ===========================================================================
-- Notification system (fix plan Phase 10, item 10.4)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- In-app notification feed (the bell): one row per user per event.
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        text NOT NULL,
    title       text NOT NULL,
    body        text,
    href        text,
    read_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread
    ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_firm_id ON notifications(firm_id);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- Users see and update (mark read) only their own rows; inserts come from
-- background jobs (service role) and same-firm staff actions.
CREATE POLICY notifications_read_own ON notifications
    FOR SELECT TO authenticated
    USING (firm_id = public.firm_id() AND user_id = public.current_user_id());
CREATE POLICY notifications_update_own ON notifications
    FOR UPDATE TO authenticated
    USING (firm_id = public.firm_id() AND user_id = public.current_user_id())
    WITH CHECK (firm_id = public.firm_id() AND user_id = public.current_user_id());
CREATE POLICY notifications_insert_same_firm ON notifications
    FOR INSERT TO authenticated
    WITH CHECK (firm_id = public.firm_id());

-- ---------------------------------------------------------------------------
-- Per-user notification preferences
-- ---------------------------------------------------------------------------
-- Shape (all keys optional; defaults in src/lib/notifications/prefs.ts):
--   { "message_email": "immediate" | "daily" | "off",
--     "meeting_reminders": bool,
--     "weekly_digest": bool }
ALTER TABLE users
    ADD COLUMN notification_preferences_json jsonb NOT NULL DEFAULT '{}';
