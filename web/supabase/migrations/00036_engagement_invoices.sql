-- ===========================================================================
-- Engagement invoices (fix plan Phase 12, item 12.3)
-- ===========================================================================
-- One invoice per agreement installment, generated when the agreement
-- fully executes (both signatures). The retainer's invoice is due on the
-- execution date; every other invoice inherits its installment's due date.
-- Each invoice's immutable PDF is archived in Documents (family-visible),
-- reusing the signed-agreement pattern. All money is integer cents, USD.

-- Leftover manual helper from the dropped SaaS-billing era (00003); its
-- body references tables 00035 removed, so it could only ever error.
DROP FUNCTION IF EXISTS assign_internal_plan(uuid);

CREATE TABLE invoices (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    family_id           uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    agreement_id        uuid NOT NULL REFERENCES service_agreements(id) ON DELETE CASCADE,
    -- One invoice per installment; UNIQUE makes generation idempotent.
    installment_id      uuid NOT NULL UNIQUE REFERENCES agreement_installments(id) ON DELETE CASCADE,
    -- Per-firm sequential accounting number ("INV-0001"); the UNIQUE pair
    -- backstops the application-side numbering against races.
    invoice_number      text NOT NULL,
    amount_cents        int NOT NULL CHECK (amount_cents > 0),
    -- Full domain enum, mirrored in src/lib/constants/billing.ts. 12.3
    -- writes only 'open'; 'paid' arrives with 12.4 payment collection and
    -- 'void' with credit/adjustment flows — deliberate schema breadth so
    -- 12.4 does not have to relax a CHECK. "Overdue" is derived from
    -- due_on in the app layer, never stored.
    status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'paid', 'void')),
    due_on              date NOT NULL,
    issued_at           timestamptz NOT NULL DEFAULT now(),
    -- The archived immutable PDF (family-visible documents row).
    document_id         uuid REFERENCES documents(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (firm_id, invoice_number)
);
CREATE INDEX idx_invoices_firm_id ON invoices(firm_id);
CREATE INDEX idx_invoices_firm_id_family_id ON invoices(firm_id, family_id);
CREATE INDEX idx_invoices_agreement_id ON invoices(agreement_id);
CREATE TRIGGER trg_invoices_set_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Reads are firm-scoped: parents review and (12.5) pay their invoices in
-- the portal; fine-grained who-sees-which filtering is app-layer, matching
-- agreement_installments. Writes are staff-only — the generation path runs
-- as the countersigning staff member, and portal roles never mutate money.
CREATE POLICY invoices_member_read ON invoices
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY invoices_staff_write ON invoices
    FOR ALL
    USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());
