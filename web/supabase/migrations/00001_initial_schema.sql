-- =============================================================================
-- CounselWorks Initial Schema Migration
-- =============================================================================
-- College counseling platform database schema.
-- All tenant-scoped tables include firm_id for multi-tenancy.
-- RLS policies use auth.firm_id() placeholder (to be implemented).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Placeholder function: auth.firm_id()
-- Returns the firm_id for the currently authenticated user.
-- Replace this stub with real logic once auth is wired up.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.firm_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_firm_id', true), '')::uuid
$$;

-- ===========================================================================
-- 1. firms
-- ===========================================================================
CREATE TABLE firms (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    slug            text NOT NULL UNIQUE,
    status          text NOT NULL DEFAULT 'active',
    plan_type       text NOT NULL DEFAULT 'free',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE firms ENABLE ROW LEVEL SECURITY;

CREATE POLICY firms_tenant_access ON firms
    USING (id = auth.firm_id());

-- ===========================================================================
-- 2. users
-- ===========================================================================
CREATE TABLE users (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_provider_user_id   text NOT NULL UNIQUE,
    email                   text NOT NULL UNIQUE,
    first_name              text NOT NULL,
    last_name               text NOT NULL,
    global_platform_role    text,
    last_login_at           timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self_access ON users
    USING (true);  -- refined once auth is wired up

-- ===========================================================================
-- 3. firm_memberships
-- ===========================================================================
CREATE TABLE firm_memberships (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role                text NOT NULL,
    status              text NOT NULL DEFAULT 'active',
    invited_by_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
    joined_at           timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (firm_id, user_id)
);

CREATE INDEX idx_firm_memberships_firm_id ON firm_memberships(firm_id);
CREATE INDEX idx_firm_memberships_user_id ON firm_memberships(user_id);

ALTER TABLE firm_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY firm_memberships_tenant_access ON firm_memberships
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 4. firm_settings
-- ===========================================================================
CREATE TABLE firm_settings (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                         uuid NOT NULL UNIQUE REFERENCES firms(id) ON DELETE CASCADE,
    branding_logo_url               text,
    primary_color                   text,
    enabled_modules_json            jsonb NOT NULL DEFAULT '{}',
    communication_preferences_json  jsonb NOT NULL DEFAULT '{}',
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_firm_settings_firm_id ON firm_settings(firm_id);

ALTER TABLE firm_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY firm_settings_tenant_access ON firm_settings
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 5. families
-- ===========================================================================
CREATE TABLE families (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    household_name          text NOT NULL,
    address_line1           text,
    address_line2           text,
    city                    text,
    state_region            text,
    postal_code             text,
    country                 text,
    financial_notes_private text,
    created_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    archived_at             timestamptz
);

CREATE INDEX idx_families_firm_id ON families(firm_id);

ALTER TABLE families ENABLE ROW LEVEL SECURITY;

CREATE POLICY families_tenant_access ON families
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 6. family_members
-- ===========================================================================
CREATE TABLE family_members (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    family_id           uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relationship_type   text NOT NULL,
    is_primary_contact  boolean NOT NULL DEFAULT false,
    visibility_scope    text NOT NULL DEFAULT 'staff',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_family_members_firm_id ON family_members(firm_id);
CREATE INDEX idx_family_members_family_id ON family_members(family_id);

ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY family_members_tenant_access ON family_members
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 7. students
-- ===========================================================================
CREATE TABLE students (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    family_id               uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id                 uuid REFERENCES users(id) ON DELETE SET NULL,
    first_name              text NOT NULL,
    last_name               text NOT NULL,
    preferred_name          text,
    date_of_birth           date,
    graduation_year         int NOT NULL,
    school_name             text,
    school_type             text,
    gpa_unweighted          numeric,
    gpa_weighted            numeric,
    class_rank              text,
    intended_majors_json    jsonb,
    academic_interests      text,
    extracurricular_summary text,
    status                  text NOT NULL DEFAULT 'active',
    created_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    archived_at             timestamptz
);

CREATE INDEX idx_students_firm_id ON students(firm_id);
CREATE INDEX idx_students_firm_id_student_id ON students(firm_id, id);
CREATE INDEX idx_students_firm_id_status ON students(firm_id, status);
CREATE INDEX idx_students_family_id ON students(family_id);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY students_tenant_access ON students
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 8. student_profiles
-- ===========================================================================
CREATE TABLE student_profiles (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_id                  uuid NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    citizenship_status          text,
    testing_summary_json        jsonb,
    awards_json                 jsonb,
    activities_json             jsonb,
    budget_range                text,
    financial_aid_interest      text,
    counselor_strategy_notes    text,
    internal_rating             text,
    risk_flags_json             jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_profiles_firm_id ON student_profiles(firm_id);
CREATE INDEX idx_student_profiles_firm_id_student_id ON student_profiles(firm_id, student_id);

ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_profiles_tenant_access ON student_profiles
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 9. student_staff_assignments
-- ===========================================================================
CREATE TABLE student_staff_assignments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assignment_type text NOT NULL,
    is_primary      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (student_id, user_id, assignment_type)
);

CREATE INDEX idx_student_staff_assignments_firm_id ON student_staff_assignments(firm_id);
CREATE INDEX idx_student_staff_assignments_firm_id_student_id ON student_staff_assignments(firm_id, student_id);

ALTER TABLE student_staff_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_staff_assignments_tenant_access ON student_staff_assignments
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 10. colleges (global -- no firm_id)
-- ===========================================================================
CREATE TABLE colleges (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text NOT NULL,
    slug                    text NOT NULL UNIQUE,
    city                    text,
    state_region            text,
    country                 text,
    website_url             text,
    application_platform    text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;

CREATE POLICY colleges_read_authenticated ON colleges
    FOR SELECT USING (true);

-- ===========================================================================
-- 11. college_contacts
-- ===========================================================================
CREATE TABLE college_contacts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    college_id      uuid NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
    contact_name    text NOT NULL,
    contact_type    text NOT NULL,
    email           text,
    phone           text,
    notes           text
);

CREATE INDEX idx_college_contacts_college_id ON college_contacts(college_id);

ALTER TABLE college_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY college_contacts_read_authenticated ON college_contacts
    FOR SELECT USING (true);

-- ===========================================================================
-- 12. student_colleges
-- ===========================================================================
CREATE TABLE student_colleges (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_id              uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    college_id              uuid NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
    category                text NOT NULL,
    round_type              text,
    intended_major          text,
    interest_level          int,
    counselor_fit_rating    int,
    status                  text NOT NULL DEFAULT 'researching',
    decision_result         text,
    deposit_status          text,
    notes                   text,
    created_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (student_id, college_id)
);

CREATE INDEX idx_student_colleges_firm_id ON student_colleges(firm_id);
CREATE INDEX idx_student_colleges_firm_id_student_id ON student_colleges(firm_id, student_id);
CREATE INDEX idx_student_colleges_student_id_college_id ON student_colleges(student_id, college_id);

ALTER TABLE student_colleges ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_colleges_tenant_access ON student_colleges
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 13. applications
-- ===========================================================================
CREATE TABLE applications (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_college_id      uuid NOT NULL REFERENCES student_colleges(id) ON DELETE CASCADE,
    student_id              uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    college_id              uuid NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
    application_type        text NOT NULL,
    stage                   text NOT NULL DEFAULT 'not_started',
    deadline_at             timestamptz,
    submitted_at            timestamptz,
    decision_at             timestamptz,
    decision_result         text,
    financial_aid_required  boolean NOT NULL DEFAULT false,
    scholarship_required    boolean NOT NULL DEFAULT false,
    checklist_json          jsonb,
    created_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_applications_firm_id ON applications(firm_id);
CREATE INDEX idx_applications_firm_id_student_id ON applications(firm_id, student_id);
CREATE INDEX idx_applications_firm_id_status ON applications(firm_id, stage);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY applications_tenant_access ON applications
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 14. workflow_templates
-- ===========================================================================
CREATE TABLE workflow_templates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid REFERENCES firms(id) ON DELETE CASCADE,
    name                text NOT NULL,
    workflow_type       text NOT NULL,
    is_system_template  boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_templates_firm_id ON workflow_templates(firm_id);

ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_templates_tenant_access ON workflow_templates
    USING (firm_id = auth.firm_id() OR (firm_id IS NULL AND is_system_template = true));

-- ===========================================================================
-- 15. workflow_template_steps
-- ===========================================================================
CREATE TABLE workflow_template_steps (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_template_id        uuid NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    name                        text NOT NULL,
    step_order                  int NOT NULL,
    step_type                   text NOT NULL,
    default_due_offset_days     int,
    visibility_scope            text NOT NULL DEFAULT 'staff',
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_template_steps_template_id ON workflow_template_steps(workflow_template_id);

ALTER TABLE workflow_template_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_template_steps_access ON workflow_template_steps
    USING (true);  -- access controlled through parent workflow_template

-- ===========================================================================
-- 16. student_workflows
-- ===========================================================================
CREATE TABLE student_workflows (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_id              uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    workflow_template_id    uuid NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    status                  text NOT NULL DEFAULT 'not_started',
    started_at              timestamptz,
    completed_at            timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_workflows_firm_id ON student_workflows(firm_id);
CREATE INDEX idx_student_workflows_firm_id_student_id ON student_workflows(firm_id, student_id);

ALTER TABLE student_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_workflows_tenant_access ON student_workflows
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 17. student_workflow_steps
-- ===========================================================================
CREATE TABLE student_workflow_steps (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_workflow_id     uuid NOT NULL REFERENCES student_workflows(id) ON DELETE CASCADE,
    template_step_id        uuid NOT NULL REFERENCES workflow_template_steps(id) ON DELETE CASCADE,
    status                  text NOT NULL DEFAULT 'pending',
    assigned_user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
    due_date                date,
    completed_at            timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_workflow_steps_workflow_id ON student_workflow_steps(student_workflow_id);

ALTER TABLE student_workflow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_workflow_steps_access ON student_workflow_steps
    USING (true);  -- access controlled through parent student_workflow

-- ===========================================================================
-- 18. tasks
-- ===========================================================================
CREATE TABLE tasks (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    title                   text NOT NULL,
    description             text,
    task_type               text NOT NULL,
    status                  text NOT NULL DEFAULT 'pending',
    priority                text NOT NULL DEFAULT 'medium',
    visibility_scope        text NOT NULL DEFAULT 'staff',
    assigned_user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
    student_id              uuid REFERENCES students(id) ON DELETE SET NULL,
    family_id               uuid REFERENCES families(id) ON DELETE SET NULL,
    application_id          uuid REFERENCES applications(id) ON DELETE SET NULL,
    related_entity_type     text,
    related_entity_id       uuid,
    due_at                  timestamptz,
    completed_at            timestamptz,
    created_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    archived_at             timestamptz
);

CREATE INDEX idx_tasks_firm_id ON tasks(firm_id);
CREATE INDEX idx_tasks_firm_id_assigned_user_id ON tasks(firm_id, assigned_user_id);
CREATE INDEX idx_tasks_firm_id_student_id ON tasks(firm_id, student_id);
CREATE INDEX idx_tasks_firm_id_status ON tasks(firm_id, status);
CREATE INDEX idx_tasks_firm_id_due_at ON tasks(firm_id, due_at);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_tenant_access ON tasks
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 19. notes
-- ===========================================================================
CREATE TABLE notes (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_id              uuid REFERENCES students(id) ON DELETE SET NULL,
    family_id               uuid REFERENCES families(id) ON DELETE SET NULL,
    application_id          uuid REFERENCES applications(id) ON DELETE SET NULL,
    student_college_id      uuid REFERENCES student_colleges(id) ON DELETE SET NULL,
    note_type               text NOT NULL,
    visibility_scope        text NOT NULL DEFAULT 'staff',
    title                   text,
    body                    text NOT NULL,
    created_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    archived_at             timestamptz
);

CREATE INDEX idx_notes_firm_id ON notes(firm_id);
CREATE INDEX idx_notes_firm_id_student_id ON notes(firm_id, student_id);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY notes_tenant_access ON notes
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 20. meetings
-- ===========================================================================
CREATE TABLE meetings (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_id              uuid REFERENCES students(id) ON DELETE SET NULL,
    family_id               uuid REFERENCES families(id) ON DELETE SET NULL,
    meeting_type            text NOT NULL,
    title                   text NOT NULL,
    scheduled_start_at      timestamptz,
    scheduled_end_at        timestamptz,
    location_text           text,
    agenda                  text,
    summary                 text,
    visibility_scope        text NOT NULL DEFAULT 'staff',
    created_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meetings_firm_id ON meetings(firm_id);
CREATE INDEX idx_meetings_firm_id_student_id ON meetings(firm_id, student_id);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY meetings_tenant_access ON meetings
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 21. meeting_attendees
-- ===========================================================================
CREATE TABLE meeting_attendees (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id          uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attendance_status   text
);

CREATE INDEX idx_meeting_attendees_meeting_id ON meeting_attendees(meeting_id);

ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_attendees_access ON meeting_attendees
    USING (true);  -- access controlled through parent meeting

-- ===========================================================================
-- 22. conversations
-- ===========================================================================
CREATE TABLE conversations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    conversation_type       text NOT NULL,
    visibility_scope        text NOT NULL DEFAULT 'staff',
    student_id              uuid REFERENCES students(id) ON DELETE SET NULL,
    family_id               uuid REFERENCES families(id) ON DELETE SET NULL,
    application_id          uuid REFERENCES applications(id) ON DELETE SET NULL,
    related_entity_type     text,
    related_entity_id       uuid,
    created_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_firm_id ON conversations(firm_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_tenant_access ON conversations
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 23. conversation_participants
-- ===========================================================================
CREATE TABLE conversation_participants (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    participant_role    text,
    joined_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_participants_conversation_id ON conversation_participants(conversation_id);

ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_participants_access ON conversation_participants
    USING (true);  -- access controlled through parent conversation

-- ===========================================================================
-- 24. messages
-- ===========================================================================
CREATE TABLE messages (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    body                text NOT NULL,
    sent_at             timestamptz NOT NULL DEFAULT now(),
    edited_at           timestamptz,
    deleted_at          timestamptz
);

CREATE INDEX idx_messages_conversation_id_sent_at ON messages(conversation_id, sent_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_access ON messages
    USING (true);  -- access controlled through parent conversation

-- ===========================================================================
-- 25. message_reads
-- ===========================================================================
CREATE TABLE message_reads (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_reads_message_id ON message_reads(message_id);

ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY message_reads_access ON message_reads
    USING (true);  -- access controlled through parent message/conversation

-- ===========================================================================
-- 26. documents
-- ===========================================================================
CREATE TABLE documents (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_id              uuid REFERENCES students(id) ON DELETE SET NULL,
    family_id               uuid REFERENCES families(id) ON DELETE SET NULL,
    application_id          uuid REFERENCES applications(id) ON DELETE SET NULL,
    related_entity_type     text,
    related_entity_id       uuid,
    category                text NOT NULL,
    title                   text NOT NULL,
    storage_key             text NOT NULL,
    mime_type               text NOT NULL,
    file_size_bytes         bigint,
    visibility_scope        text NOT NULL DEFAULT 'staff',
    uploaded_by_user_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    archived_at             timestamptz
);

CREATE INDEX idx_documents_firm_id ON documents(firm_id);
CREATE INDEX idx_documents_firm_id_student_id ON documents(firm_id, student_id);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_tenant_access ON documents
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 27. document_versions
-- ===========================================================================
CREATE TABLE document_versions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_number      int NOT NULL,
    storage_key         text NOT NULL,
    uploaded_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (document_id, version_number)
);

CREATE INDEX idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX idx_document_versions_document_id_version ON document_versions(document_id, version_number);

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_versions_access ON document_versions
    USING (true);  -- access controlled through parent document

-- ===========================================================================
-- 28. essay_drafts
-- ===========================================================================
CREATE TABLE essay_drafts (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_id              uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    application_id          uuid REFERENCES applications(id) ON DELETE SET NULL,
    student_college_id      uuid REFERENCES student_colleges(id) ON DELETE SET NULL,
    essay_type              text NOT NULL,
    prompt_text             text,
    title                   text,
    body                    text,
    word_count_target       int,
    status                  text NOT NULL DEFAULT 'draft',
    current_version_number  int NOT NULL DEFAULT 1,
    visibility_scope        text NOT NULL DEFAULT 'staff',
    created_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_essay_drafts_firm_id ON essay_drafts(firm_id);
CREATE INDEX idx_essay_drafts_firm_id_student_id ON essay_drafts(firm_id, student_id);

ALTER TABLE essay_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY essay_drafts_tenant_access ON essay_drafts
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- 29. essay_draft_versions
-- ===========================================================================
CREATE TABLE essay_draft_versions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    essay_draft_id      uuid NOT NULL REFERENCES essay_drafts(id) ON DELETE CASCADE,
    version_number      int NOT NULL,
    body                text,
    commentary          text,
    created_by_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (essay_draft_id, version_number)
);

CREATE INDEX idx_essay_draft_versions_draft_id ON essay_draft_versions(essay_draft_id);
CREATE INDEX idx_essay_draft_versions_draft_id_version ON essay_draft_versions(essay_draft_id, version_number);

ALTER TABLE essay_draft_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY essay_draft_versions_access ON essay_draft_versions
    USING (true);  -- access controlled through parent essay_draft

-- ===========================================================================
-- 30. audit_events
-- ===========================================================================
CREATE TABLE audit_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         uuid REFERENCES firms(id) ON DELETE SET NULL,
    actor_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
    entity_type     text NOT NULL,
    entity_id       uuid,
    action_type     text NOT NULL,
    metadata_json   jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_events_firm_id ON audit_events(firm_id);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_events_tenant_access ON audit_events
    USING (firm_id = auth.firm_id() OR firm_id IS NULL);

-- ===========================================================================
-- 31. document_access_logs
-- ===========================================================================
CREATE TABLE document_access_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    document_id     uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type     text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_access_logs_firm_id ON document_access_logs(firm_id);
CREATE INDEX idx_document_access_logs_document_id ON document_access_logs(document_id);

ALTER TABLE document_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_access_logs_tenant_access ON document_access_logs
    USING (firm_id = auth.firm_id());

-- ===========================================================================
-- Updated-at trigger function
-- ===========================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Apply updated_at triggers to all tables with an updated_at column
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'updated_at'
        ORDER BY table_name
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_set_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW
             EXECUTE FUNCTION set_updated_at()',
            tbl, tbl
        );
    END LOOP;
END;
$$;
