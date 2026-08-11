-- ===========================================================================
-- Storage: the documents bucket (fix plan 11.6 pre-cutover)
-- ===========================================================================
-- Every document path in the app writes to the `documents` bucket
-- (src/lib/storage/index.ts, used by actions/documents.ts, messages.ts, and
-- agreements.ts), but nothing ever created it outside the E2E seed. The
-- production project had no storage buckets at all, so uploads failed there
-- while working locally — the golden path's document steps could never have
-- passed against a deployment.
--
-- Deliberately NOT public and deliberately WITHOUT storage.objects policies:
-- all access is server-signed after requireDocumentAccess (docs/SECURITY.md,
-- rollout step 7). Adding a client policy here would bypass that check.
--
-- Only `documents` is created. src/lib/storage also exports BUCKET_ESSAYS and
-- BUCKET_UPLOADS, but nothing calls them — creating buckets for unused
-- constants would be the half-wiring CLAUDE.md's Definition of Done forbids.
--
-- Portability: the CI migrations job runs on plain Postgres, where the
-- storage schema does not exist, so the whole body is guarded (same pattern
-- as supabase/seed/e2e-users.sql). Idempotent: safe to re-apply.

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_namespace WHERE nspname = 'storage') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('documents', 'documents', false)
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;
