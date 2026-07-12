-- ===========================================================================
-- Document lifecycle (fix plan Phase 10, item 10.5)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- First-class document requests (replaces the Phase-3 task-based stopgap)
-- ---------------------------------------------------------------------------
CREATE TABLE document_requests (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_id             uuid REFERENCES students(id) ON DELETE CASCADE,
    family_id              uuid REFERENCES families(id) ON DELETE CASCADE,
    title                  text NOT NULL,
    category               text NOT NULL DEFAULT 'other',
    note                   text,
    due_at                 timestamptz,
    status                 text NOT NULL DEFAULT 'requested'
                           CHECK (status IN ('requested', 'fulfilled', 'cancelled')),
    requested_by_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    fulfilled_document_id  uuid REFERENCES documents(id) ON DELETE SET NULL,
    fulfilled_at           timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CHECK (student_id IS NOT NULL OR family_id IS NOT NULL)
);
CREATE INDEX idx_document_requests_firm_id ON document_requests(firm_id);
CREATE INDEX idx_document_requests_firm_status
    ON document_requests(firm_id, status);
CREATE TRIGGER trg_document_requests_set_updated_at
    BEFORE UPDATE ON document_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;
-- Portal roles read requests aimed at them (app layer narrows to their own
-- student/family) and update them (fulfilment on upload); only staff create
-- or delete. Which transitions a portal user may make is app-layer logic.
CREATE POLICY document_requests_member_read ON document_requests
    FOR SELECT TO authenticated
    USING (firm_id = public.firm_id());
CREATE POLICY document_requests_member_update ON document_requests
    FOR UPDATE TO authenticated
    USING (firm_id = public.firm_id())
    WITH CHECK (firm_id = public.firm_id());
CREATE POLICY document_requests_staff_insert ON document_requests
    FOR INSERT TO authenticated
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());
CREATE POLICY document_requests_staff_delete ON document_requests
    FOR DELETE TO authenticated
    USING (firm_id = public.firm_id() AND public.is_staff());

-- ---------------------------------------------------------------------------
-- Message attachments (documents linked to messages)
-- ---------------------------------------------------------------------------
CREATE TABLE message_attachments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (message_id, document_id)
);
CREATE INDEX idx_message_attachments_firm_id ON message_attachments(firm_id);
CREATE INDEX idx_message_attachments_message_id
    ON message_attachments(message_id);
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY message_attachments_tenant_isolation ON message_attachments
    FOR ALL TO authenticated
    USING (firm_id = public.firm_id())
    WITH CHECK (firm_id = public.firm_id());
