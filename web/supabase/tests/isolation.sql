-- ===========================================================================
-- RLS isolation test suite (fix plan Phase 1.8)
-- ===========================================================================
-- Runs against a database with all migrations + seed/test-fixtures.sql
-- applied. Impersonates each persona by assuming the `authenticated` role
-- with a Clerk-style JWT claim, exactly as Supabase third-party auth does,
-- then asserts that tenancy and coarse role gates hold WITHOUT any
-- application-layer filters. Everything runs in one rolled-back transaction.
--
-- Personas come from supabase/seed/test-fixtures.sql (firm Alpha = a000...,
-- firm Beta = b000...).

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Persona: Firm Alpha counselor
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"test_clerk_alpha_counselor"}', true);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
    -- Identity helpers resolve correctly.
    IF public.firm_id() IS DISTINCT FROM 'a0000000-0000-4000-8000-000000000001'::uuid THEN
        RAISE EXCEPTION 'firm_id() resolved % for alpha counselor', public.firm_id();
    END IF;
    IF NOT public.is_staff() THEN
        RAISE EXCEPTION 'is_staff() false for alpha counselor';
    END IF;

    -- Tenancy: an UNFILTERED select must return only firm Alpha rows.
    IF (SELECT count(*) FROM students) <> 1 THEN
        RAISE EXCEPTION 'alpha counselor sees % students, expected 1 (alpha only)',
            (SELECT count(*) FROM students);
    END IF;
    IF EXISTS (SELECT 1 FROM students WHERE firm_id <> public.firm_id()) THEN
        RAISE EXCEPTION 'alpha counselor can see another firm''s students';
    END IF;
    IF (SELECT count(*) FROM families) <> 1 THEN
        RAISE EXCEPTION 'alpha counselor sees % families, expected 1', (SELECT count(*) FROM families);
    END IF;
    IF (SELECT count(*) FROM firm_memberships) <> 5 THEN
        RAISE EXCEPTION 'alpha counselor sees % memberships, expected 5', (SELECT count(*) FROM firm_memberships);
    END IF;

    -- users table: no cross-firm identities (emails are PII).
    IF EXISTS (SELECT 1 FROM users WHERE email LIKE '%@beta.test') THEN
        RAISE EXCEPTION 'alpha counselor can read beta users';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'parent1@alpha.test') THEN
        RAISE EXCEPTION 'alpha counselor cannot read own-firm parent user';
    END IF;

    -- System workflow templates remain readable.
    IF (SELECT count(*) FROM workflow_templates WHERE is_system_template) < 8 THEN
        RAISE EXCEPTION 'system workflow templates not visible (%)',
            (SELECT count(*) FROM workflow_templates WHERE is_system_template);
    END IF;

    -- Cross-firm UPDATE hits zero rows even when targeted by UUID.
    UPDATE students SET school_name = 'pwned'
        WHERE id = 'b0000000-0000-4000-8000-000000000041';
    IF FOUND THEN
        RAISE EXCEPTION 'alpha counselor updated a beta student';
    END IF;

    -- Cross-firm INSERT is rejected by WITH CHECK.
    BEGIN
        INSERT INTO students (firm_id, family_id, first_name, last_name,
                              graduation_year, created_by_user_id, updated_by_user_id)
        VALUES ('b0000000-0000-4000-8000-000000000001',
                'b0000000-0000-4000-8000-000000000021',
                'Sneaky', 'Insert', 2028,
                'a0000000-0000-4000-8000-000000000012',
                'a0000000-0000-4000-8000-000000000012');
        RAISE EXCEPTION 'alpha counselor inserted a student into firm beta';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL; -- expected: RLS WITH CHECK
    END;
END
$$;

-- Staff can create conversations in their own firm (needed below and by the app).
INSERT INTO conversations (id, firm_id, conversation_type, visibility_scope, created_by_user_id)
VALUES ('a0000000-0000-4000-8000-000000000051',
        'a0000000-0000-4000-8000-000000000001',
        'general', 'staff',
        'a0000000-0000-4000-8000-000000000012');

DO $$
BEGIN
    -- Message inserts must be sent as yourself.
    BEGIN
        INSERT INTO messages (conversation_id, sender_user_id, body)
        VALUES ('a0000000-0000-4000-8000-000000000051',
                'a0000000-0000-4000-8000-000000000011',  -- impersonating the owner
                'spoofed');
        RAISE EXCEPTION 'counselor inserted a message as another sender';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    INSERT INTO messages (conversation_id, sender_user_id, body)
    VALUES ('a0000000-0000-4000-8000-000000000051',
            'a0000000-0000-4000-8000-000000000012',
            'hello from alpha counselor');
END
$$;

-- ---------------------------------------------------------------------------
-- Persona: Firm Beta owner (cross-firm reads of alpha's data)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"test_clerk_beta_owner"}', true);

DO $$
BEGIN
    IF public.firm_id() IS DISTINCT FROM 'b0000000-0000-4000-8000-000000000001'::uuid THEN
        RAISE EXCEPTION 'firm_id() resolved % for beta owner', public.firm_id();
    END IF;

    IF (SELECT count(*) FROM students) <> 1
       OR NOT EXISTS (SELECT 1 FROM students WHERE id = 'b0000000-0000-4000-8000-000000000041') THEN
        RAISE EXCEPTION 'beta owner does not see exactly their own student';
    END IF;

    -- Alpha's conversation and message (child table via parent) are invisible.
    IF EXISTS (SELECT 1 FROM conversations
               WHERE id = 'a0000000-0000-4000-8000-000000000051') THEN
        RAISE EXCEPTION 'beta owner can read an alpha conversation';
    END IF;
    IF EXISTS (SELECT 1 FROM messages
               WHERE conversation_id = 'a0000000-0000-4000-8000-000000000051') THEN
        RAISE EXCEPTION 'beta owner can read alpha messages (child-table leak)';
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Persona: Firm Alpha student (portal role)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"test_clerk_alpha_student"}', true);

DO $$
BEGIN
    IF public.is_staff() THEN
        RAISE EXCEPTION 'is_staff() true for a student';
    END IF;

    -- Reads are firm-scoped (fine-grained portal filtering is app-layer).
    IF EXISTS (SELECT 1 FROM students WHERE firm_id <> public.firm_id()) THEN
        RAISE EXCEPTION 'student can read another firm''s students';
    END IF;

    -- Staff-write gates: portal roles cannot mutate staff-managed tables.
    UPDATE students SET school_name = 'edited by student'
        WHERE id = 'a0000000-0000-4000-8000-000000000041';
    IF FOUND THEN
        RAISE EXCEPTION 'student mutated the students table';
    END IF;

    UPDATE families SET household_name = 'edited by student'
        WHERE id = 'a0000000-0000-4000-8000-000000000021';
    IF FOUND THEN
        RAISE EXCEPTION 'student mutated the families table';
    END IF;

    BEGIN
        INSERT INTO notes (firm_id, note_type, body, visibility_scope,
                           student_id, created_by_user_id, updated_by_user_id)
        VALUES ('a0000000-0000-4000-8000-000000000001', 'general', 'student note', 'staff',
                'a0000000-0000-4000-8000-000000000041',
                'a0000000-0000-4000-8000-000000000015',
                'a0000000-0000-4000-8000-000000000015');
        RAISE EXCEPTION 'student inserted a note (staff-managed table)';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        INSERT INTO student_staff_assignments (firm_id, student_id, user_id, assignment_type)
        VALUES ('a0000000-0000-4000-8000-000000000001',
                'a0000000-0000-4000-8000-000000000041',
                'a0000000-0000-4000-8000-000000000015', 'counselor');
        RAISE EXCEPTION 'student granted themselves a staff assignment';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$$;

-- ---------------------------------------------------------------------------
-- Persona: unauthenticated (no JWT)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '', true);

DO $$
BEGIN
    IF (SELECT count(*) FROM students) <> 0 THEN
        RAISE EXCEPTION 'unauthenticated request can read students';
    END IF;
    IF (SELECT count(*) FROM users) <> 0 THEN
        RAISE EXCEPTION 'unauthenticated request can read users';
    END IF;
    IF (SELECT count(*) FROM firms) <> 0 THEN
        RAISE EXCEPTION 'unauthenticated request can read firms';
    END IF;
    -- The college catalog is deliberately world-readable (global data).
    IF (SELECT count(*) FROM colleges) < 100 THEN
        RAISE EXCEPTION 'college catalog unexpectedly restricted';
    END IF;
END
$$;

ROLLBACK;

\echo 'isolation suite passed'
