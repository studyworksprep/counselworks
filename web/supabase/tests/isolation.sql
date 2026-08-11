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

    INSERT INTO messages (id, conversation_id, sender_user_id, body)
    VALUES ('a0000000-0000-4000-8000-000000000052',
            'a0000000-0000-4000-8000-000000000051',
            'a0000000-0000-4000-8000-000000000012',
            'hello from alpha counselor');
END
$$;

-- Phase 10.5: staff create document requests and message attachments.
INSERT INTO document_requests (id, firm_id, student_id, family_id, title,
                               requested_by_user_id)
VALUES ('a0000000-0000-4000-8000-000000000091',
        'a0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000041',
        'a0000000-0000-4000-8000-000000000021',
        'Junior transcript',
        'a0000000-0000-4000-8000-000000000012');

INSERT INTO documents (id, firm_id, title, category, storage_key, mime_type,
                       visibility_scope, student_id, uploaded_by_user_id)
VALUES ('a0000000-0000-4000-8000-000000000081',
        'a0000000-0000-4000-8000-000000000001',
        'Attached file', 'other',
        'a0000000-0000-4000-8000-000000000001/students/x/attach.pdf',
        'application/pdf', 'family',
        'a0000000-0000-4000-8000-000000000041',
        'a0000000-0000-4000-8000-000000000012');

INSERT INTO message_attachments (firm_id, message_id, document_id)
VALUES ('a0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000052',
        'a0000000-0000-4000-8000-000000000081');

-- Phase 10.6: staff plan test sittings (aid_awards shares the same policy).
INSERT INTO test_sittings (id, firm_id, student_id, test_type, test_date,
                           registration_deadline, created_by_user_id)
VALUES ('a0000000-0000-4000-8000-000000000095',
        'a0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000041',
        'sat', '2026-10-03', '2026-09-04',
        'a0000000-0000-4000-8000-000000000012');

-- Phase 10.4: notifications are PER-USER (read policy uses current_user_id(),
-- not just firm_id()). Seed one for the counselor and one for the owner.
INSERT INTO notifications (id, firm_id, user_id, kind, title)
VALUES
  ('a0000000-0000-4000-8000-0000000000a1',
   'a0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000012', 'test', 'For the counselor'),
  ('a0000000-0000-4000-8000-0000000000a2',
   'a0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000011', 'test', 'For the owner');

DO $$
BEGIN
    -- Still the alpha counselor (user 012): sees only their own feed.
    IF NOT EXISTS (SELECT 1 FROM notifications
                   WHERE id = 'a0000000-0000-4000-8000-0000000000a1') THEN
        RAISE EXCEPTION 'counselor cannot read their own notification';
    END IF;
    IF EXISTS (SELECT 1 FROM notifications
               WHERE id = 'a0000000-0000-4000-8000-0000000000a2') THEN
        RAISE EXCEPTION 'counselor can read another user''s notification';
    END IF;
END
$$;

DO $$
BEGIN
    -- Staff can record a family invitation in their own firm...
    INSERT INTO family_invitations (id, firm_id, family_id, family_member_id,
                                    placeholder_user_id, email,
                                    clerk_invitation_id, sent_by_user_id)
    VALUES ('a0000000-0000-4000-8000-000000000061',
            'a0000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000021',
            'a0000000-0000-4000-8000-000000000031',
            'a0000000-0000-4000-8000-000000000013',
            'parent1@alpha.test', 'inv_test_isolation_1',
            'a0000000-0000-4000-8000-000000000012');
END
$$;

-- Essays for the Phase 5 student-editing checks (created as staff).
INSERT INTO essay_drafts (id, firm_id, student_id, essay_type, title, body,
                          status, visibility_scope, current_version_number,
                          created_by_user_id, updated_by_user_id)
VALUES
  ('a0000000-0000-4000-8000-000000000071',
   'a0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000041',
   'personal_statement', 'Shared draft', 'first words', 'draft', 'student', 1,
   'a0000000-0000-4000-8000-000000000012',
   'a0000000-0000-4000-8000-000000000012'),
  ('a0000000-0000-4000-8000-000000000072',
   'a0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000041',
   'supplemental', 'Internal draft', 'staff notes', 'draft', 'staff', 1,
   'a0000000-0000-4000-8000-000000000012',
   'a0000000-0000-4000-8000-000000000012');

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

    -- Alpha's family invitation is invisible cross-firm.
    IF EXISTS (SELECT 1 FROM family_invitations
               WHERE id = 'a0000000-0000-4000-8000-000000000061') THEN
        RAISE EXCEPTION 'beta owner can read an alpha family invitation';
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

    -- Phase 10.5 tables are firm-scoped.
    IF EXISTS (SELECT 1 FROM document_requests
               WHERE id = 'a0000000-0000-4000-8000-000000000091') THEN
        RAISE EXCEPTION 'beta owner can read an alpha document request';
    END IF;
    IF EXISTS (SELECT 1 FROM message_attachments
               WHERE message_id = 'a0000000-0000-4000-8000-000000000052') THEN
        RAISE EXCEPTION 'beta owner can read alpha message attachments';
    END IF;
    IF EXISTS (SELECT 1 FROM notifications
               WHERE id = 'a0000000-0000-4000-8000-0000000000a2') THEN
        RAISE EXCEPTION 'beta owner can read an alpha notification';
    END IF;
    IF EXISTS (SELECT 1 FROM test_sittings
               WHERE id = 'a0000000-0000-4000-8000-000000000095') THEN
        RAISE EXCEPTION 'beta owner can read an alpha test sitting';
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

    -- Phase 5: students edit their own SHARED essay drafts...
    UPDATE essay_drafts SET body = 'student revision'
        WHERE id = 'a0000000-0000-4000-8000-000000000071';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'student cannot edit their shared essay draft';
    END IF;
    INSERT INTO essay_draft_versions (essay_draft_id, version_number, body,
                                      created_by_user_id)
    VALUES ('a0000000-0000-4000-8000-000000000071', 2, 'student revision',
            'a0000000-0000-4000-8000-000000000015');

    -- ...but staff-only drafts stay untouchable even for the same student.
    UPDATE essay_drafts SET body = 'peeked'
        WHERE id = 'a0000000-0000-4000-8000-000000000072';
    IF FOUND THEN
        RAISE EXCEPTION 'student edited a staff-only essay draft';
    END IF;

    -- Recommenders are staff-managed.
    BEGIN
        INSERT INTO recommenders (firm_id, student_id, name,
                                  created_by_user_id, updated_by_user_id)
        VALUES ('a0000000-0000-4000-8000-000000000001',
                'a0000000-0000-4000-8000-000000000041', 'Self Reference',
                'a0000000-0000-4000-8000-000000000015',
                'a0000000-0000-4000-8000-000000000015');
        RAISE EXCEPTION 'student inserted a recommender (staff-managed table)';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    -- Phase 4: students update their own profile (intake)...
    UPDATE student_profiles SET sat_score = 1450
        WHERE student_id = 'a0000000-0000-4000-8000-000000000041';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'student cannot update their own profile (intake broken)';
    END IF;

    -- ...but not another student's profile (cross-firm targeted by UUID).
    UPDATE student_profiles SET sat_score = 1
        WHERE student_id = 'b0000000-0000-4000-8000-000000000041';
    IF FOUND THEN
        RAISE EXCEPTION 'student updated another firm''s profile';
    END IF;

    -- Phase 3: portal roles may upload documents as themselves...
    INSERT INTO documents (firm_id, title, category, storage_key, mime_type,
                           visibility_scope, student_id, uploaded_by_user_id)
    VALUES ('a0000000-0000-4000-8000-000000000001', 'My transcript', 'transcript',
            'a0000000-0000-4000-8000-000000000001/students/x/test.pdf',
            'application/pdf', 'family',
            'a0000000-0000-4000-8000-000000000041',
            'a0000000-0000-4000-8000-000000000015');

    -- ...but not impersonating another uploader.
    BEGIN
        INSERT INTO documents (firm_id, title, category, storage_key, mime_type,
                               visibility_scope, student_id, uploaded_by_user_id)
        VALUES ('a0000000-0000-4000-8000-000000000001', 'Spoofed', 'other',
                'a0000000-0000-4000-8000-000000000001/students/x/spoof.pdf',
                'application/pdf', 'staff',
                'a0000000-0000-4000-8000-000000000041',
                'a0000000-0000-4000-8000-000000000012');
        RAISE EXCEPTION 'student uploaded a document as another user';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    -- Updates stay staff-only even for own uploads.
    UPDATE documents SET title = 'renamed'
        WHERE title = 'My transcript';
    IF FOUND THEN
        RAISE EXCEPTION 'student mutated a document row';
    END IF;

    BEGIN
        INSERT INTO family_invitations (firm_id, family_id, family_member_id,
                                        placeholder_user_id, email,
                                        clerk_invitation_id, sent_by_user_id)
        VALUES ('a0000000-0000-4000-8000-000000000001',
                'a0000000-0000-4000-8000-000000000021',
                'a0000000-0000-4000-8000-000000000031',
                'a0000000-0000-4000-8000-000000000013',
                'student@alpha.test', 'inv_test_isolation_2',
                'a0000000-0000-4000-8000-000000000015');
        RAISE EXCEPTION 'student inserted a family invitation (staff-managed table)';
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

    -- Phase 10.5: students see requests aimed at them and can fulfil them...
    IF NOT EXISTS (SELECT 1 FROM document_requests
                   WHERE id = 'a0000000-0000-4000-8000-000000000091') THEN
        RAISE EXCEPTION 'student cannot see their own document request';
    END IF;
    UPDATE document_requests SET status = 'fulfilled', fulfilled_at = now()
        WHERE id = 'a0000000-0000-4000-8000-000000000091';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'student cannot fulfil a document request (upload flow broken)';
    END IF;

    -- ...but cannot create requests (staff-only).
    BEGIN
        INSERT INTO document_requests (firm_id, student_id, title,
                                       requested_by_user_id)
        VALUES ('a0000000-0000-4000-8000-000000000001',
                'a0000000-0000-4000-8000-000000000041',
                'Self request',
                'a0000000-0000-4000-8000-000000000015');
        RAISE EXCEPTION 'student inserted a document request (staff-only)';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    -- Phase 10.6: students read their testing plan but cannot edit it.
    IF NOT EXISTS (SELECT 1 FROM test_sittings
                   WHERE id = 'a0000000-0000-4000-8000-000000000095') THEN
        RAISE EXCEPTION 'student cannot read their own test sitting';
    END IF;
    UPDATE test_sittings SET score = '1600'
        WHERE id = 'a0000000-0000-4000-8000-000000000095';
    IF FOUND THEN
        RAISE EXCEPTION 'student edited a test sitting (staff-managed table)';
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Persona: Firm Alpha parent (family intake)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"test_clerk_alpha_parent1"}', true);

DO $$
BEGIN
    -- Parents update their child's profile (family intake)...
    UPDATE student_profiles SET budget_range = '$40-60k'
        WHERE student_id = 'a0000000-0000-4000-8000-000000000041';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'parent cannot update their child''s profile (intake broken)';
    END IF;

    -- ...but not profiles outside their family/firm.
    UPDATE student_profiles SET budget_range = 'pwned'
        WHERE student_id = 'b0000000-0000-4000-8000-000000000041';
    IF FOUND THEN
        RAISE EXCEPTION 'parent updated another firm''s profile';
    END IF;

    -- Parents still cannot write staff-managed tables.
    UPDATE students SET school_name = 'edited by parent'
        WHERE id = 'a0000000-0000-4000-8000-000000000041';
    IF FOUND THEN
        RAISE EXCEPTION 'parent mutated the students table';
    END IF;
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
