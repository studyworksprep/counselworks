-- ===========================================================================
-- RLS enforcement preflight (fix plan 11.6) — safe to run against a real
-- deployment
-- ===========================================================================
-- supabase/tests/isolation.sql is the authoritative suite, but it depends on
-- the two-firm personas in seed/test-fixtures.sql. A real deployment does not
-- have those rows and must never be seeded with them, so that suite cannot be
-- the pre-cutover check the runbook once asked for.
--
-- This file is the deployment-side equivalent: it proves the same enforced
-- path (role `authenticated` + a Clerk-style JWT claim) using whatever real
-- users the database already has, and asserts nothing about fixture data.
--
-- Read-only and wrapped in a rolled-back transaction: it writes nothing.
--
--   psql "$DATABASE_URL" -f supabase/tests/preflight-rls.sql
--
-- Prints 'preflight passed' on success; any failure raises and aborts.

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The identity helpers are the real implementations, not the 00001 stub.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_proc
        WHERE proname = 'clerk_user_id'
          AND pronamespace = 'public'::regnamespace
          AND prosrc LIKE '%auth.jwt%'
    ) THEN
        RAISE EXCEPTION
            'public.clerk_user_id() does not read auth.jwt() — migration 00016 is not applied';
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_proc
        WHERE proname = 'firm_id'
          AND pronamespace = 'public'::regnamespace
          AND prosecdef
    ) THEN
        RAISE EXCEPTION 'public.firm_id() missing or not SECURITY DEFINER';
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Every public table has RLS enabled.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    unprotected text;
BEGIN
    SELECT string_agg(tablename, ', ')
      INTO unprotected
      FROM pg_tables
     WHERE schemaname = 'public'
       AND NOT rowsecurity;

    IF unprotected IS NOT NULL THEN
        RAISE EXCEPTION 'tables without RLS enabled: %', unprotected;
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. No user holds more than one active membership.
-- ---------------------------------------------------------------------------
-- public.firm_id() resolves the OLDEST active membership. resolveUserAndFirm()
-- and the ICS feed route apply the same rule, but a user in several firms has
-- no way to reach the others, and any future drift between those three call
-- sites silently mis-scopes them. Treat this as a blocker until a real
-- session-scoped firm switch exists.
DO $$
DECLARE
    offenders int;
BEGIN
    SELECT count(*) INTO offenders FROM (
        SELECT user_id
          FROM firm_memberships
         WHERE status = 'active'
         GROUP BY user_id
        HAVING count(*) > 1
    ) multi;

    IF offenders > 0 THEN
        RAISE EXCEPTION
            '% user(s) hold more than one active firm membership — resolve before enabling RLS (see docs/SECURITY.md, Known limits)',
            offenders;
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Impersonate each real active staff user: tenancy holds with no
--    application-layer filter.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    persona   record;
    seen_firm uuid;
    leaked    int;
    checked   int := 0;
BEGIN
    FOR persona IN
        SELECT u.auth_provider_user_id AS sub, m.firm_id
          FROM firm_memberships m
          JOIN users u ON u.id = m.user_id
         WHERE m.status = 'active'
           -- Placeholder rows have no Clerk identity to impersonate yet.
           AND u.auth_provider_user_id NOT LIKE 'invited\_%'
           AND u.auth_provider_user_id NOT LIKE 'pending\_%'
    LOOP
        PERFORM set_config('request.jwt.claims',
                           json_build_object('sub', persona.sub)::text, true);
        SET LOCAL ROLE authenticated;

        -- The helper resolves this caller to the firm we expect.
        SELECT public.firm_id() INTO seen_firm;
        IF seen_firm IS DISTINCT FROM persona.firm_id THEN
            RESET ROLE;
            RAISE EXCEPTION
                'firm_id() resolved % for a member of % — app context and RLS would disagree',
                seen_firm, persona.firm_id;
        END IF;

        -- Unfiltered reads return only this firm's rows. These are the
        -- queries an app-layer bug would issue without a firm_id filter.
        SELECT count(*) INTO leaked
          FROM students WHERE firm_id <> persona.firm_id;
        IF leaked > 0 THEN
            RESET ROLE;
            RAISE EXCEPTION 'student rows from other firms visible: %', leaked;
        END IF;

        SELECT count(*) INTO leaked
          FROM families WHERE firm_id <> persona.firm_id;
        IF leaked > 0 THEN
            RESET ROLE;
            RAISE EXCEPTION 'family rows from other firms visible: %', leaked;
        END IF;

        RESET ROLE;
        checked := checked + 1;
    END LOOP;

    IF checked = 0 THEN
        RAISE EXCEPTION
            'no claimable staff identity found — cannot prove enforcement on this database';
    END IF;

    RAISE NOTICE 'preflight: % persona(s) checked', checked;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. An unauthenticated caller sees no tenant data.
-- ---------------------------------------------------------------------------
-- On a real Supabase project `anon` holds no grants on tenant tables, so the
-- read raises insufficient_privilege rather than returning zero rows. Both
-- outcomes are a pass; anything else is not.
DO $$
DECLARE
    visible int;
BEGIN
    PERFORM set_config('request.jwt.claims', NULL, true);
    SET LOCAL ROLE anon;

    BEGIN
        SELECT count(*) INTO visible FROM firms;
        IF visible > 0 THEN
            RESET ROLE;
            RAISE EXCEPTION 'anon can read % firm row(s)', visible;
        END IF;

        SELECT count(*) INTO visible FROM students;
        IF visible > 0 THEN
            RESET ROLE;
            RAISE EXCEPTION 'anon can read % student row(s)', visible;
        END IF;
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL; -- no grants at all: the stronger outcome
    END;

    RESET ROLE;
END
$$;

ROLLBACK;

\echo 'preflight passed'
