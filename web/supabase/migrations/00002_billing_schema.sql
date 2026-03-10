-- =============================================================================
-- CounselWorks Billing & Subscription Schema Migration
-- =============================================================================
-- Adds subscription plans, firm subscriptions, invoices, and payment methods.
-- Aligns firms table with application types (adds missing columns).
-- Introduces an 'internal' plan type for unlimited owner-firm usage.
-- =============================================================================

-- ===========================================================================
-- 1. Align firms table with application types
-- ===========================================================================
ALTER TABLE firms
    ADD COLUMN IF NOT EXISTS logo_url               text,
    ADD COLUMN IF NOT EXISTS website                 text,
    ADD COLUMN IF NOT EXISTS phone                   text,
    ADD COLUMN IF NOT EXISTS email                   text,
    ADD COLUMN IF NOT EXISTS address_line1           text,
    ADD COLUMN IF NOT EXISTS address_line2           text,
    ADD COLUMN IF NOT EXISTS city                    text,
    ADD COLUMN IF NOT EXISTS state                   text,
    ADD COLUMN IF NOT EXISTS zip                     text,
    ADD COLUMN IF NOT EXISTS country                 text,
    ADD COLUMN IF NOT EXISTS timezone                text NOT NULL DEFAULT 'America/New_York',
    ADD COLUMN IF NOT EXISTS subscription_plan       text,
    ADD COLUMN IF NOT EXISTS subscription_status     text,
    ADD COLUMN IF NOT EXISTS trial_ends_at           timestamptz;

-- ===========================================================================
-- 2. subscription_plans — defines available plan tiers
-- ===========================================================================
CREATE TABLE subscription_plans (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text NOT NULL UNIQUE,
    slug                text NOT NULL UNIQUE,
    tier                int NOT NULL DEFAULT 0,
    monthly_price_cents int NOT NULL DEFAULT 0,
    annual_price_cents  int NOT NULL DEFAULT 0,
    max_seats           int,                 -- NULL = unlimited
    max_students        int,                 -- NULL = unlimited
    features_json       jsonb NOT NULL DEFAULT '{}',
    is_active           boolean NOT NULL DEFAULT true,
    is_internal         boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_plans_read ON subscription_plans
    FOR SELECT USING (true);

-- ===========================================================================
-- 3. firm_subscriptions — active subscription per firm
-- ===========================================================================
CREATE TABLE firm_subscriptions (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    plan_id                 uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status                  text NOT NULL DEFAULT 'active',
    billing_interval        text NOT NULL DEFAULT 'monthly',
    stripe_subscription_id  text UNIQUE,
    stripe_customer_id      text,
    current_period_start    timestamptz NOT NULL DEFAULT now(),
    current_period_end      timestamptz,
    cancel_at               timestamptz,
    canceled_at             timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_firm_subscriptions_firm_id ON firm_subscriptions(firm_id);
CREATE INDEX idx_firm_subscriptions_status ON firm_subscriptions(status);
CREATE UNIQUE INDEX idx_firm_subscriptions_active ON firm_subscriptions(firm_id)
    WHERE status IN ('active', 'trialing', 'past_due');

ALTER TABLE firm_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY firm_subscriptions_tenant_access ON firm_subscriptions
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 4. payment_methods — stored payment methods per firm
-- ===========================================================================
CREATE TABLE payment_methods (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    stripe_payment_method_id    text NOT NULL UNIQUE,
    type                        text NOT NULL DEFAULT 'card',
    card_brand                  text,
    card_last4                  text,
    card_exp_month              int,
    card_exp_year               int,
    is_default                  boolean NOT NULL DEFAULT false,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_methods_firm_id ON payment_methods(firm_id);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_methods_tenant_access ON payment_methods
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 5. invoices — billing records
-- ===========================================================================
CREATE TABLE invoices (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    subscription_id         uuid REFERENCES firm_subscriptions(id) ON DELETE SET NULL,
    stripe_invoice_id       text UNIQUE,
    amount_cents            int NOT NULL,
    currency                text NOT NULL DEFAULT 'usd',
    status                  text NOT NULL DEFAULT 'draft',
    description             text,
    period_start            timestamptz,
    period_end              timestamptz,
    due_at                  timestamptz,
    paid_at                 timestamptz,
    invoice_pdf_url         text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_firm_id ON invoices(firm_id);
CREATE INDEX idx_invoices_status ON invoices(status);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_tenant_access ON invoices
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 6. Apply updated_at triggers to new tables
-- ===========================================================================
CREATE TRIGGER trg_subscription_plans_set_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_firm_subscriptions_set_updated_at
    BEFORE UPDATE ON firm_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payment_methods_set_updated_at
    BEFORE UPDATE ON payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_invoices_set_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- 7. Seed default subscription plans
-- ===========================================================================
INSERT INTO subscription_plans (name, slug, tier, monthly_price_cents, annual_price_cents, max_seats, max_students, features_json, is_active, is_internal)
VALUES
    ('Free',         'free',         0,     0,       0,      2,    10,   '{"modules": ["students", "families", "colleges"]}',                                                                                  true,  false),
    ('Starter',      'starter',      1,  4900,   47000,      5,    50,   '{"modules": ["students", "families", "colleges", "applications", "tasks", "notes", "documents"]}',                                    true,  false),
    ('Professional', 'professional', 2,  9900,   95000,     15,   200,   '{"modules": ["students", "families", "colleges", "applications", "tasks", "notes", "documents", "meetings", "messages", "essays"]}',   true,  false),
    ('Enterprise',   'enterprise',   3, 19900,  191000,     50,  1000,   '{"modules": ["students", "families", "colleges", "applications", "tasks", "notes", "documents", "meetings", "messages", "essays", "workflows", "reports", "audit"]}', true, false),
    ('Internal',     'internal',     99,    0,       0,   NULL,  NULL,   '{"modules": ["students", "families", "colleges", "applications", "tasks", "notes", "documents", "meetings", "messages", "essays", "workflows", "reports", "audit"]}', true, true);
