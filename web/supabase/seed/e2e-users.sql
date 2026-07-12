-- ===========================================================================
-- E2E staff identities (golden-path suite, fix plan 7.10) — never prod
-- ===========================================================================
-- Two staff logins in test firm Alpha, stored as claimable "invited_"
-- placeholders. On first sign-in with the matching Clerk dev-instance test
-- email, resolveUserAndFirm links the Clerk account to these rows via the
-- email-match claim path — no webhook or manual linking needed.
--
-- The emails MUST match the suite's env (E2E_OWNER_EMAIL /
-- E2E_COUNSELOR_EMAIL, defaults below) and contain "+clerk_test" so Clerk
-- treats them as test identities. Idempotent: safe to re-run.

INSERT INTO users (id, auth_provider_user_id, email, first_name, last_name) VALUES
    ('e2e00000-0000-4000-8000-000000000011', 'invited_e2e_owner',
     'e2e-owner+clerk_test@example.com', 'E2E', 'Owner'),
    ('e2e00000-0000-4000-8000-000000000012', 'invited_e2e_counselor',
     'e2e-counselor+clerk_test@example.com', 'E2E', 'Counselor')
ON CONFLICT (id) DO NOTHING;

INSERT INTO firm_memberships (firm_id, user_id, role, status, joined_at) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-000000000011', 'firm_owner', 'active', now()),
    ('a0000000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-000000000012', 'counselor',  'active', now())
ON CONFLICT DO NOTHING;

-- The app's document storage bucket. Only meaningful on a real Supabase
-- stack (local `supabase start` or a project); the plpgsql guard makes this
-- file inert on plain Postgres, where the storage schema doesn't exist.
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_namespace WHERE nspname = 'storage') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('documents', 'documents', false)
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;
