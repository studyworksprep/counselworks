-- ===========================================================================
-- RLS foundation (fix plan Phase 1)
-- ===========================================================================
-- Replaces the placeholder public.firm_id() stub with a real lookup driven by
-- the Clerk JWT (Supabase third-party auth), closes the USING (true) policies
-- on child tables, restricts the users table, and adds coarse staff-write
-- gates. Fine-grained visibility (visibility_scope, participants, staff
-- assignment) stays in the application's authorization layer
-- (src/lib/auth/authorize.ts); RLS enforces tenancy and coarse role
-- boundaries as defense in depth.
--
-- Portability: this migration also runs on plain Postgres (CI) where the
-- Supabase-managed roles and auth schema don't exist, so those are created
-- conditionally. On a real Supabase project every guarded block is a no-op.

-- ---------------------------------------------------------------------------
-- 1. Roles (exist already on Supabase)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
    END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. auth schema + auth.jwt() (exist already on Supabase; needed in CI)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'auth' AND p.proname = 'jwt'
    ) THEN
        EXECUTE $fn$
            CREATE FUNCTION auth.jwt() RETURNS jsonb
            LANGUAGE sql STABLE
            AS $body$
                SELECT coalesce(
                    nullif(current_setting('request.jwt.claims', true), ''),
                    '{}'
                )::jsonb
            $body$;
        $fn$;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA auth TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Identity helpers
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: these run as the migration role, which owns the tables,
-- so their internal lookups are exempt from RLS (no policy recursion).

CREATE OR REPLACE FUNCTION public.clerk_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT nullif(auth.jwt() ->> 'sub', '')
$$;

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT u.id
    FROM users u
    WHERE u.auth_provider_user_id = public.clerk_user_id()
$$;

-- Replaces the 00001 placeholder. Picks the oldest active membership; the
-- app's resolveUserAndFirm() makes the same single-firm assumption.
CREATE OR REPLACE FUNCTION public.firm_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT fm.firm_id
    FROM firm_memberships fm
    WHERE fm.user_id = public.current_user_id()
      AND fm.status = 'active'
    ORDER BY fm.created_at
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_member_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT fm.role
    FROM firm_memberships fm
    WHERE fm.user_id = public.current_user_id()
      AND fm.status = 'active'
    ORDER BY fm.created_at
    LIMIT 1
$$;

-- Keep this list in sync with STAFF_ROLES in src/lib/auth/resolve.ts.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT public.current_member_role() IN (
        'firm_owner', 'firm_admin', 'counselor',
        'essay_coach', 'tutor', 'read_only_staff'
    )
$$;

-- A user row is visible inside the current firm if they are a member, a
-- family contact, or a linked student of that firm.
CREATE OR REPLACE FUNCTION public.user_visible_in_current_firm(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM firm_memberships fm
        WHERE fm.user_id = target_user_id AND fm.firm_id = public.firm_id()
    ) OR EXISTS (
        SELECT 1 FROM family_members fam
        WHERE fam.user_id = target_user_id AND fam.firm_id = public.firm_id()
    ) OR EXISTS (
        SELECT 1 FROM students s
        WHERE s.user_id = target_user_id AND s.firm_id = public.firm_id()
    )
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
-- The app's user-scoped client runs as `authenticated`; RLS does the actual
-- scoping. `anon` gets nothing: no CounselWorks surface reads data without a
-- session.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- ---------------------------------------------------------------------------
-- 5. users: replace USING (true) with self-or-same-firm visibility
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS users_self_access ON users;

CREATE POLICY users_select_visible ON users
    FOR SELECT
    USING (
        auth_provider_user_id = public.clerk_user_id()
        OR public.user_visible_in_current_firm(id)
    );

-- Users may edit their own profile row. Provisioning, invitation claiming,
-- and cross-user writes stay on the service-role client.
CREATE POLICY users_update_self ON users
    FOR UPDATE
    USING (auth_provider_user_id = public.clerk_user_id())
    WITH CHECK (auth_provider_user_id = public.clerk_user_id());

-- ---------------------------------------------------------------------------
-- 6. Staff-write gates on staff-managed tenant tables
-- ---------------------------------------------------------------------------
-- Pattern: everyone in the firm can read (portal queries add their own
-- fine-grained filters in the app layer); only staff roles can write.
-- Tables that portal flows legitimately write (tasks, workflow step updates,
-- messages) are handled separately in section 7.

-- firms: members read their own firm; staff update it; inserts stay
-- service-role (auto-provisioning).
DROP POLICY IF EXISTS firms_tenant_access ON firms;
CREATE POLICY firms_member_read ON firms
    FOR SELECT USING (id = public.firm_id());
CREATE POLICY firms_staff_update ON firms
    FOR UPDATE USING (id = public.firm_id() AND public.is_staff())
    WITH CHECK (id = public.firm_id() AND public.is_staff());

DROP POLICY IF EXISTS firm_settings_tenant_access ON firm_settings;
CREATE POLICY firm_settings_member_read ON firm_settings
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY firm_settings_staff_write ON firm_settings
    FOR ALL USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());

DROP POLICY IF EXISTS firm_memberships_tenant_access ON firm_memberships;
CREATE POLICY firm_memberships_member_read ON firm_memberships
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY firm_memberships_staff_write ON firm_memberships
    FOR ALL USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'families',
        'family_members',
        'students',
        'student_profiles',
        'student_staff_assignments',
        'student_colleges',
        'applications',
        'meetings',
        'notes',
        'student_invitations',
        'documents',
        'essay_drafts'
    ] LOOP
        -- Original single tenant policy names vary; drop both known shapes.
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_access', t);

        EXECUTE format(
            'CREATE POLICY %I ON %I FOR SELECT USING (firm_id = public.firm_id())',
            t || '_member_read', t);

        -- NOTE: documents and essay_drafts are staff-write for now. Phase 3
        -- (portal document upload) and Phase 5 (student essay editing) will
        -- relax these deliberately, in their own migrations.
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL
               USING (firm_id = public.firm_id() AND public.is_staff())
               WITH CHECK (firm_id = public.firm_id() AND public.is_staff())',
            t || '_staff_write', t);
    END LOOP;
END
$$;

-- workflow_templates: keep system templates (firm_id IS NULL) readable by
-- every firm; writes require staff and a firm-owned row.
DROP POLICY IF EXISTS workflow_templates_tenant_access ON workflow_templates;
CREATE POLICY workflow_templates_member_read ON workflow_templates
    FOR SELECT USING (
        firm_id = public.firm_id()
        OR (firm_id IS NULL AND is_system_template = true)
    );
CREATE POLICY workflow_templates_staff_write ON workflow_templates
    FOR ALL
    USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());

-- ---------------------------------------------------------------------------
-- 7. Tables portal roles legitimately write (tenancy-checked writes)
-- ---------------------------------------------------------------------------
-- tasks: students complete their portal tasks, and completing a task can
-- materialize newly unblocked workflow tasks in the same request. Deletes
-- (archive is an UPDATE; hard delete unused) stay staff-only.
DROP POLICY IF EXISTS tasks_tenant_access ON tasks;
CREATE POLICY tasks_member_read ON tasks
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY tasks_member_insert ON tasks
    FOR INSERT WITH CHECK (firm_id = public.firm_id());
CREATE POLICY tasks_member_update ON tasks
    FOR UPDATE USING (firm_id = public.firm_id())
    WITH CHECK (firm_id = public.firm_id());
CREATE POLICY tasks_staff_delete ON tasks
    FOR DELETE USING (firm_id = public.firm_id() AND public.is_staff());

-- student_workflows / steps: instantiation is staff; step status updates run
-- as whoever completed the linked task (including portal students).
DROP POLICY IF EXISTS student_workflows_tenant_access ON student_workflows;
CREATE POLICY student_workflows_member_read ON student_workflows
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY student_workflows_member_update ON student_workflows
    FOR UPDATE USING (firm_id = public.firm_id())
    WITH CHECK (firm_id = public.firm_id());
CREATE POLICY student_workflows_staff_insert ON student_workflows
    FOR INSERT WITH CHECK (firm_id = public.firm_id() AND public.is_staff());
CREATE POLICY student_workflows_staff_delete ON student_workflows
    FOR DELETE USING (firm_id = public.firm_id() AND public.is_staff());

DROP POLICY IF EXISTS student_workflow_steps_access ON student_workflow_steps;
CREATE POLICY student_workflow_steps_member_read ON student_workflow_steps
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM student_workflows sw
        WHERE sw.id = student_workflow_steps.student_workflow_id
          AND sw.firm_id = public.firm_id()
    ));
CREATE POLICY student_workflow_steps_member_update ON student_workflow_steps
    FOR UPDATE USING (EXISTS (
        SELECT 1 FROM student_workflows sw
        WHERE sw.id = student_workflow_steps.student_workflow_id
          AND sw.firm_id = public.firm_id()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM student_workflows sw
        WHERE sw.id = student_workflow_steps.student_workflow_id
          AND sw.firm_id = public.firm_id()
    ));
CREATE POLICY student_workflow_steps_staff_insert ON student_workflow_steps
    FOR INSERT WITH CHECK (
        public.is_staff() AND EXISTS (
            SELECT 1 FROM student_workflows sw
            WHERE sw.id = student_workflow_steps.student_workflow_id
              AND sw.firm_id = public.firm_id()
        )
    );
CREATE POLICY student_workflow_steps_staff_delete ON student_workflow_steps
    FOR DELETE USING (
        public.is_staff() AND EXISTS (
            SELECT 1 FROM student_workflows sw
            WHERE sw.id = student_workflow_steps.student_workflow_id
              AND sw.firm_id = public.firm_id()
        )
    );

-- conversations / participants / messages / reads: firm-scoped; senders can
-- only write messages as themselves. Participant/visibility enforcement is
-- in the app layer (Phase 3 tightens the model for portal messaging).
DROP POLICY IF EXISTS conversations_tenant_access ON conversations;
CREATE POLICY conversations_member_read ON conversations
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY conversations_member_insert ON conversations
    FOR INSERT WITH CHECK (
        firm_id = public.firm_id()
        AND created_by_user_id = public.current_user_id()
    );
CREATE POLICY conversations_member_update ON conversations
    FOR UPDATE USING (firm_id = public.firm_id())
    WITH CHECK (firm_id = public.firm_id());
CREATE POLICY conversations_staff_delete ON conversations
    FOR DELETE USING (firm_id = public.firm_id() AND public.is_staff());

DROP POLICY IF EXISTS conversation_participants_access ON conversation_participants;
CREATE POLICY conversation_participants_via_conversation ON conversation_participants
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM conversations c
        WHERE c.id = conversation_participants.conversation_id
          AND c.firm_id = public.firm_id()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM conversations c
        WHERE c.id = conversation_participants.conversation_id
          AND c.firm_id = public.firm_id()
    ));

DROP POLICY IF EXISTS messages_access ON messages;
CREATE POLICY messages_member_read ON messages
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM conversations c
        WHERE c.id = messages.conversation_id
          AND c.firm_id = public.firm_id()
    ));
CREATE POLICY messages_sender_insert ON messages
    FOR INSERT WITH CHECK (
        sender_user_id = public.current_user_id()
        AND EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.id = messages.conversation_id
              AND c.firm_id = public.firm_id()
        )
    );
CREATE POLICY messages_sender_update ON messages
    FOR UPDATE USING (sender_user_id = public.current_user_id())
    WITH CHECK (sender_user_id = public.current_user_id());

DROP POLICY IF EXISTS message_reads_access ON message_reads;
CREATE POLICY message_reads_self ON message_reads
    FOR ALL
    USING (user_id = public.current_user_id())
    WITH CHECK (
        user_id = public.current_user_id()
        AND EXISTS (
            SELECT 1
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE m.id = message_reads.message_id
              AND c.firm_id = public.firm_id()
        )
    );

-- ---------------------------------------------------------------------------
-- 8. Remaining USING (true) child tables → scope via parent
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS workflow_template_steps_access ON workflow_template_steps;
CREATE POLICY workflow_template_steps_member_read ON workflow_template_steps
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM workflow_templates wt
        WHERE wt.id = workflow_template_steps.workflow_template_id
          AND (wt.firm_id = public.firm_id()
               OR (wt.firm_id IS NULL AND wt.is_system_template = true))
    ));
CREATE POLICY workflow_template_steps_staff_write ON workflow_template_steps
    FOR ALL
    USING (
        public.is_staff() AND EXISTS (
            SELECT 1 FROM workflow_templates wt
            WHERE wt.id = workflow_template_steps.workflow_template_id
              AND wt.firm_id = public.firm_id()
        )
    )
    WITH CHECK (
        public.is_staff() AND EXISTS (
            SELECT 1 FROM workflow_templates wt
            WHERE wt.id = workflow_template_steps.workflow_template_id
              AND wt.firm_id = public.firm_id()
        )
    );

DROP POLICY IF EXISTS meeting_attendees_access ON meeting_attendees;
CREATE POLICY meeting_attendees_member_read ON meeting_attendees
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM meetings m
        WHERE m.id = meeting_attendees.meeting_id
          AND m.firm_id = public.firm_id()
    ));
CREATE POLICY meeting_attendees_staff_write ON meeting_attendees
    FOR ALL
    USING (
        public.is_staff() AND EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_attendees.meeting_id
              AND m.firm_id = public.firm_id()
        )
    )
    WITH CHECK (
        public.is_staff() AND EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_attendees.meeting_id
              AND m.firm_id = public.firm_id()
        )
    );

DROP POLICY IF EXISTS document_versions_access ON document_versions;
CREATE POLICY document_versions_member_read ON document_versions
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM documents d
        WHERE d.id = document_versions.document_id
          AND d.firm_id = public.firm_id()
    ));
CREATE POLICY document_versions_staff_write ON document_versions
    FOR ALL
    USING (
        public.is_staff() AND EXISTS (
            SELECT 1 FROM documents d
            WHERE d.id = document_versions.document_id
              AND d.firm_id = public.firm_id()
        )
    )
    WITH CHECK (
        public.is_staff() AND EXISTS (
            SELECT 1 FROM documents d
            WHERE d.id = document_versions.document_id
              AND d.firm_id = public.firm_id()
        )
    );

DROP POLICY IF EXISTS essay_draft_versions_access ON essay_draft_versions;
CREATE POLICY essay_draft_versions_member_read ON essay_draft_versions
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM essay_drafts e
        WHERE e.id = essay_draft_versions.essay_draft_id
          AND e.firm_id = public.firm_id()
    ));
-- Staff-write for now; Phase 5 relaxes for student editing.
CREATE POLICY essay_draft_versions_staff_write ON essay_draft_versions
    FOR ALL
    USING (
        public.is_staff() AND EXISTS (
            SELECT 1 FROM essay_drafts e
            WHERE e.id = essay_draft_versions.essay_draft_id
              AND e.firm_id = public.firm_id()
        )
    )
    WITH CHECK (
        public.is_staff() AND EXISTS (
            SELECT 1 FROM essay_drafts e
            WHERE e.id = essay_draft_versions.essay_draft_id
              AND e.firm_id = public.firm_id()
        )
    );
