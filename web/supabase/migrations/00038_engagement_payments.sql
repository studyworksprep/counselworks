-- ===========================================================================
-- Engagement payments (fix plan Phase 12, items 12.4/12.5)
-- ===========================================================================
-- A payments row records one confirmed Stripe payment against one invoice
-- (v1: invoices are paid in full, once — UNIQUE invoice_id both encodes
-- that and makes webhook redelivery idempotent). Rows are written only by
-- the Stripe webhook after signature verification; the money lands in the
-- FIRM's connected account (direct charge), never the platform's.

ALTER TABLE invoices
    ADD COLUMN paid_at timestamptz;

CREATE TABLE payments (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    family_id                   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    -- RESTRICT: financial history outlives everything; an invoice with a
    -- payment can never be deleted (nothing in-app deletes invoices, and
    -- the agreement cascade stops here by design).
    invoice_id                  uuid NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE RESTRICT,
    amount_cents                int NOT NULL CHECK (amount_cents > 0),
    stripe_checkout_session_id  text UNIQUE,
    stripe_payment_intent_id    text UNIQUE,
    -- The parent who initiated Checkout (from session metadata); kept even
    -- if that user is later removed.
    paid_by_user_id             uuid REFERENCES users(id) ON DELETE SET NULL,
    paid_at                     timestamptz NOT NULL DEFAULT now(),
    created_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_firm_id ON payments(firm_id);
CREATE INDEX idx_payments_firm_id_family_id ON payments(firm_id, family_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Reads are firm-scoped (parents see their own payment history; app-layer
-- filters fine-grained visibility, matching invoices). No portal writes:
-- payment rows arrive exclusively through the webhook's service-role path
-- after Stripe signature verification, and staff have no reason to forge
-- them either — staff_write exists for parity and future admin tooling.
CREATE POLICY payments_member_read ON payments
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY payments_staff_write ON payments
    FOR ALL
    USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());
