-- ===========================================================================
-- Declare the service_role grants the app has always depended on
-- ===========================================================================
-- Migration 00016 grants `authenticated` and revokes `anon`, but never says
-- anything about `service_role`. Production works only because those grants
-- were inherited from Supabase's default privileges when the tables were
-- created — the schema never declared them, so they do not reproduce.
--
-- A database built from these migrations alone comes up with no service_role
-- privileges, which breaks the identity bootstrap in resolveUserAndFirm():
--
--   Failed to auto-provision user: permission denied for table users (42501)
--
-- and, because that path then re-runs on every request, hammers Clerk's
-- Backend API until it returns 429. That is exactly how the golden-path E2E
-- suite failed on its first-ever live run (2026-08-12) — both the a11y and
-- golden-path failures traced back to this one missing grant.
--
-- The practical consequence is bigger than CI: staging, disaster recovery, or
-- any second environment provisioned from this repo would come up with a
-- broken sign-in path. This makes the schema self-contained.
--
-- 00016 already creates the role conditionally (NOLOGIN BYPASSRLS) for the
-- plain-Postgres CI job, so this migration only needs the grants. Idempotent
-- and additive: on production it re-grants privileges that are already
-- effectively present, so there is no behavior change there.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
    TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

-- No sequences exist today (every key is a UUID), but declaring the default
-- keeps a future serial/identity column from reintroducing this same class of
-- "works in prod, broken in a fresh environment" bug.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO service_role;
