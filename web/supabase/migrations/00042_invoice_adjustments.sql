-- ===========================================================================
-- Invoice adjustments: partial payments, credits, void (post-plan billing)
-- ===========================================================================
-- Phase 12 shipped invoices that are paid in full, once, by card. This
-- migration turns each invoice into a small ledger:
--   balance = amount_cents - paid_cents - credited_cents
-- where paid_cents sums the payments ledger (card via Stripe, or a manual
-- payment a staff member records: check, cash, bank transfer) and
-- credited_cents sums the new invoice_credits ledger (write-downs with a
-- reason). An invoice is 'paid' once its balance reaches zero; 'open' with
-- paid_cents > 0 renders as "Partially paid" (derived, never stored). 'void'
-- gains a reason and an actor and is only reachable while nothing has been
-- paid — a paid invoice is adjusted with a credit, never erased.
-- Refunding a card payment through Stripe stays out of scope (see the fix
-- plan); a firm that refunds out-of-band records nothing here.

-- ---------------------------------------------------------------------------
-- 1. Payments: many per invoice, with a method and provenance
-- ---------------------------------------------------------------------------
-- The v1 "one payment per invoice" UNIQUE goes; Stripe redelivery stays
-- idempotent through the UNIQUE checkout-session id.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_invoice_id_key;
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);

ALTER TABLE payments
    -- Mirrored in src/lib/constants/billing.ts (PAYMENT_METHODS).
    ADD COLUMN method text NOT NULL DEFAULT 'card'
        CHECK (method IN ('card', 'check', 'cash', 'bank_transfer', 'other')),
    -- Check number, transfer id, or a short memo for manual payments.
    ADD COLUMN reference text,
    -- The staff member who recorded a manual payment (null for Stripe).
    ADD COLUMN recorded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. Credits: write-downs against an invoice, always with a reason
-- ---------------------------------------------------------------------------
CREATE TABLE invoice_credits (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    family_id           uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    -- RESTRICT, like payments: financial history outlives the invoice.
    invoice_id          uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    amount_cents        int NOT NULL CHECK (amount_cents > 0),
    reason              text NOT NULL CHECK (length(btrim(reason)) > 0),
    created_by_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_credits_firm_id ON invoice_credits(firm_id);
CREATE INDEX idx_invoice_credits_invoice_id ON invoice_credits(invoice_id);

ALTER TABLE invoice_credits ENABLE ROW LEVEL SECURITY;

-- Reads are firm-scoped (a parent sees the credits on their own invoices;
-- fine-grained filtering is app-layer, matching invoices/payments). Writes
-- are staff-only; the action additionally requires manage_billing.
CREATE POLICY invoice_credits_member_read ON invoice_credits
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY invoice_credits_staff_write ON invoice_credits
    FOR ALL
    USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());

-- ---------------------------------------------------------------------------
-- 3. Invoices: settled totals (a cache of the two ledgers) and void details
-- ---------------------------------------------------------------------------
ALTER TABLE invoices
    ADD COLUMN paid_cents int NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
    ADD COLUMN credited_cents int NOT NULL DEFAULT 0 CHECK (credited_cents >= 0),
    ADD COLUMN voided_at timestamptz,
    ADD COLUMN voided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN void_reason text,
    -- Never settle more than the invoice is for: the CHECK is the backstop
    -- against two concurrent partial payments overshooting.
    ADD CONSTRAINT invoices_settled_within_amount
        CHECK (paid_cents + credited_cents <= amount_cents);

-- Backfill from the v1 payments (one full payment per paid invoice).
UPDATE invoices i
SET paid_cents = p.total
FROM (SELECT invoice_id, sum(amount_cents) AS total FROM payments GROUP BY invoice_id) p
WHERE p.invoice_id = i.id;

-- ---------------------------------------------------------------------------
-- 4. settle_invoice(): recompute the cache and flip status from the ledgers
-- ---------------------------------------------------------------------------
-- Called after every payment or credit insert (Stripe webhook under the
-- service role; staff actions under the user's own client — SECURITY
-- INVOKER, so RLS on invoices still applies to the update). Recomputing
-- from the ledgers rather than incrementing makes retries and redelivery
-- harmless. Status only ever moves open -> paid here; void is untouched.
CREATE OR REPLACE FUNCTION public.settle_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
    UPDATE invoices i
    SET paid_cents = COALESCE((SELECT sum(amount_cents) FROM payments WHERE invoice_id = i.id), 0),
        credited_cents = COALESCE((SELECT sum(amount_cents) FROM invoice_credits WHERE invoice_id = i.id), 0),
        status = CASE
            WHEN i.status = 'void' THEN 'void'
            WHEN COALESCE((SELECT sum(amount_cents) FROM payments WHERE invoice_id = i.id), 0)
               + COALESCE((SELECT sum(amount_cents) FROM invoice_credits WHERE invoice_id = i.id), 0)
               >= i.amount_cents THEN 'paid'
            ELSE 'open'
        END,
        paid_at = CASE
            WHEN i.status = 'void' THEN i.paid_at
            WHEN COALESCE((SELECT sum(amount_cents) FROM payments WHERE invoice_id = i.id), 0)
               + COALESCE((SELECT sum(amount_cents) FROM invoice_credits WHERE invoice_id = i.id), 0)
               >= i.amount_cents THEN COALESCE(i.paid_at, now())
            ELSE NULL
        END
    WHERE i.id = p_invoice_id;
$$;
