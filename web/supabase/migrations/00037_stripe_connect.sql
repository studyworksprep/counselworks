-- ===========================================================================
-- Stripe Connect: firm payment account (fix plan Phase 12, item 12.4)
-- ===========================================================================
-- Each firm connects its own Stripe account (Connect, controller-based:
-- full dashboard, Stripe collects fees and carries losses) and is the
-- merchant of record for its families' payments — the platform never holds
-- funds. Only the account id is stored; onboarding/charges status is read
-- live from the Stripe API (a cached copy arrives with the 12.4 webhook
-- work, where account.updated gives it an honest writer).
ALTER TABLE firm_settings
    ADD COLUMN stripe_account_id text UNIQUE;
