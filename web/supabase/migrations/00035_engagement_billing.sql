-- ===========================================================================
-- Engagement billing foundation (fix plan Phase 12, items 12.1 + 12.2)
-- ===========================================================================
-- Replaces the dormant platform-SaaS billing schema (00002/00003, never
-- referenced by app code) with firm→family engagement billing anchored to
-- the signed service agreement (10.1): the engagement fee and retainer are
-- captured on the agreement itself, and the payment schedule is stored as
-- installment rows that later phase-12 items (12.3+) turn into invoices.
-- All money is integer cents, USD.

-- ---------------------------------------------------------------------------
-- 1. Drop the dormant SaaS-billing tables (platform-subscription model).
--    No app code reads or writes these; their only rows are the 00003 seed.
--    Dropped child-first to respect the FK chain.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS payment_methods;
DROP TABLE IF EXISTS firm_subscriptions;
DROP TABLE IF EXISTS subscription_plans;

-- The firms columns only the SaaS model used (also unreferenced by app code).
ALTER TABLE firms
    DROP COLUMN IF EXISTS subscription_plan,
    DROP COLUMN IF EXISTS subscription_status,
    DROP COLUMN IF EXISTS trial_ends_at;

-- ---------------------------------------------------------------------------
-- 2. Fee terms on the agreement (12.2): captured at send time and rendered
--    into the immutable body snapshot, so the signed text and the structured
--    plan derive from the same input and cannot disagree. Both columns NULL
--    means the agreement was sent without fee terms (pre-Phase-12 rows and
--    fee-less agreements stay valid).
-- ---------------------------------------------------------------------------
ALTER TABLE service_agreements
    ADD COLUMN total_fee_cents int CHECK (total_fee_cents > 0),
    ADD COLUMN retainer_cents  int CHECK (retainer_cents >= 0),
    ADD CONSTRAINT service_agreements_fee_terms_coherent CHECK (
        (total_fee_cents IS NULL AND retainer_cents IS NULL)
        OR (total_fee_cents IS NOT NULL AND retainer_cents IS NOT NULL
            AND retainer_cents <= total_fee_cents)
    );

-- ---------------------------------------------------------------------------
-- 3. Installment schedule (12.1): one row per payable line, written once at
--    send time by staff. The retainer is installment 1 with due_on NULL
--    ("due at signing" — the concrete date is unknown until execution);
--    every other line carries a real due date. Rows are immutable in the
--    app layer (no updated_at); voiding the agreement leaves them in place
--    as part of the historical record.
-- ---------------------------------------------------------------------------
CREATE TABLE agreement_installments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    agreement_id        uuid NOT NULL REFERENCES service_agreements(id) ON DELETE CASCADE,
    installment_number  int NOT NULL CHECK (installment_number >= 1),
    label               text NOT NULL,
    amount_cents        int NOT NULL CHECK (amount_cents > 0),
    is_retainer         boolean NOT NULL DEFAULT false,
    due_on              date CHECK (is_retainer OR due_on IS NOT NULL),
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (agreement_id, installment_number)
);
CREATE INDEX idx_agreement_installments_firm_id ON agreement_installments(firm_id);
CREATE INDEX idx_agreement_installments_agreement_id
    ON agreement_installments(agreement_id);

ALTER TABLE agreement_installments ENABLE ROW LEVEL SECURITY;

-- Reads are firm-scoped: parents review their payment plan in the portal
-- (fine-grained who-sees-which-agreement filtering is app-layer, matching
-- service_agreements). Writes are staff-only — portal roles never create
-- or modify a payment schedule.
CREATE POLICY agreement_installments_member_read ON agreement_installments
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY agreement_installments_staff_write ON agreement_installments
    FOR ALL
    USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());
