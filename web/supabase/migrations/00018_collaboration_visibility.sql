-- ===========================================================================
-- Collaboration & visibility (fix plan Phase 3)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Message read receipts need idempotent upserts (unread tracking)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_reads_message_user
    ON message_reads(message_id, user_id);

-- ---------------------------------------------------------------------------
-- 2. Portal document uploads
-- ---------------------------------------------------------------------------
-- 00016 made documents staff-write. Phase 3 opens INSERT to portal roles so
-- families can submit transcripts and similar records themselves. The app
-- layer (uploadDocument) pins portal uploads to the uploader's own
-- student/family and 'family' visibility; at the RLS layer we enforce
-- tenancy and that you can only upload as yourself. Updates/deletes stay
-- staff-only.
CREATE POLICY documents_member_insert ON documents
    FOR INSERT WITH CHECK (
        firm_id = public.firm_id()
        AND uploaded_by_user_id = public.current_user_id()
    );
