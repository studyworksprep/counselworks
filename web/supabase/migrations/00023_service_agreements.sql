-- ===========================================================================
-- Service agreement e-signature (fix plan Phase 10, item 10.1)
-- ===========================================================================
-- Native ESIGN/UETA-oriented implementation: firm-branded agreement template,
-- two-party signing (firm signer + parent/guardian), electronic-consent
-- record, immutable body snapshot + SHA-256 hash, signer identity /
-- timestamp / IP / user-agent audit trail, and a signed PDF archived in
-- Documents (family-visible). A provider integration (SignWell/Documenso)
-- can replace the signing layer later without changing this schema.

-- ---------------------------------------------------------------------------
-- Agreement templates (firm-authored engagement letters)
-- ---------------------------------------------------------------------------
CREATE TABLE agreement_templates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name                text NOT NULL,
    -- Plain-text body; {{family_name}}, {{firm_name}}, {{date}} placeholders
    -- are substituted into the immutable snapshot at send time.
    body                text NOT NULL,
    is_active           boolean NOT NULL DEFAULT true,
    created_by_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agreement_templates_firm_id ON agreement_templates(firm_id);
CREATE TRIGGER trg_agreement_templates_set_updated_at
    BEFORE UPDATE ON agreement_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE agreement_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY agreement_templates_tenant_isolation ON agreement_templates
    FOR ALL TO authenticated
    USING (firm_id = public.firm_id())
    WITH CHECK (firm_id = public.firm_id());
CREATE POLICY agreement_templates_staff_write ON agreement_templates
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (public.is_staff());

-- ---------------------------------------------------------------------------
-- Sent agreements (one per family engagement)
-- ---------------------------------------------------------------------------
CREATE TABLE service_agreements (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id               uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    family_id             uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    template_id           uuid REFERENCES agreement_templates(id) ON DELETE SET NULL,
    title                 text NOT NULL,
    -- Immutable snapshot of the rendered agreement text at send time; the
    -- hash is what both parties sign over.
    body_snapshot         text NOT NULL,
    document_hash         text NOT NULL, -- SHA-256 hex of body_snapshot
    status                text NOT NULL DEFAULT 'sent'
                          CHECK (status IN ('sent', 'partially_signed', 'completed', 'voided')),
    sent_at               timestamptz NOT NULL DEFAULT now(),
    completed_at          timestamptz,
    voided_at             timestamptz,
    -- The archived signed PDF (family-visible documents row), set on completion.
    signed_document_id    uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_by_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_service_agreements_firm_id ON service_agreements(firm_id);
CREATE INDEX idx_service_agreements_firm_id_family_id
    ON service_agreements(firm_id, family_id);
CREATE TRIGGER trg_service_agreements_set_updated_at
    BEFORE UPDATE ON service_agreements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE service_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_agreements_tenant_isolation ON service_agreements
    FOR ALL TO authenticated
    USING (firm_id = public.firm_id())
    WITH CHECK (firm_id = public.firm_id());

-- ---------------------------------------------------------------------------
-- Signature events (audit trail; one row per signer)
-- ---------------------------------------------------------------------------
CREATE TABLE agreement_signatures (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    agreement_id            uuid NOT NULL REFERENCES service_agreements(id) ON DELETE CASCADE,
    signer_user_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    signer_role             text NOT NULL CHECK (signer_role IN ('firm', 'family')),
    -- Typed full-name signature = the clear intent-to-sign action.
    signed_name             text NOT NULL,
    -- ESIGN consent-to-transact-electronically checkbox, recorded verbatim.
    consent_given           boolean NOT NULL,
    document_hash_at_signing text NOT NULL,
    ip_address              text,
    user_agent              text,
    signed_at               timestamptz NOT NULL DEFAULT now(),
    UNIQUE (agreement_id, signer_role)
);
CREATE INDEX idx_agreement_signatures_firm_id ON agreement_signatures(firm_id);
CREATE INDEX idx_agreement_signatures_agreement_id
    ON agreement_signatures(agreement_id);
ALTER TABLE agreement_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY agreement_signatures_tenant_isolation ON agreement_signatures
    FOR ALL TO authenticated
    USING (firm_id = public.firm_id())
    WITH CHECK (firm_id = public.firm_id());

-- ---------------------------------------------------------------------------
-- Firm setting: gate portal invitations on a completed agreement
-- ---------------------------------------------------------------------------
ALTER TABLE firm_settings
    ADD COLUMN require_signed_agreement boolean NOT NULL DEFAULT false;
