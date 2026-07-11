-- ===========================================================================
-- Test fixtures: two isolated firms (CI / local testing only — never prod)
-- ===========================================================================
-- Fixed UUIDs so tests can reference rows deterministically. Firm Alpha uses
-- the a000... prefix, Firm Beta b000... Every isolation test in the suite
-- asserts that no query issued as a Firm Alpha user can reach a b000... row
-- (and vice versa), and that portal roles cannot reach staff-scoped rows.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Firms
-- ---------------------------------------------------------------------------
INSERT INTO firms (id, name, slug) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'Alpha College Counseling', 'alpha-test'),
    ('b0000000-0000-4000-8000-000000000001', 'Beta Admissions Advisors', 'beta-test')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Users (auth_provider_user_id values are fake Clerk IDs for tests)
-- ---------------------------------------------------------------------------
INSERT INTO users (id, auth_provider_user_id, email, first_name, last_name) VALUES
    -- Firm Alpha
    ('a0000000-0000-4000-8000-000000000011', 'test_clerk_alpha_owner',     'owner@alpha.test',     'Olivia', 'Ownersen'),
    ('a0000000-0000-4000-8000-000000000012', 'test_clerk_alpha_counselor', 'counselor@alpha.test', 'Carl',   'Counselman'),
    ('a0000000-0000-4000-8000-000000000013', 'test_clerk_alpha_parent1',   'parent1@alpha.test',   'Paula',  'Parent'),
    ('a0000000-0000-4000-8000-000000000014', 'test_clerk_alpha_parent2',   'parent2@alpha.test',   'Peter',  'Parent'),
    ('a0000000-0000-4000-8000-000000000015', 'test_clerk_alpha_student',   'student@alpha.test',   'Sam',    'Studentson'),
    -- Firm Beta
    ('b0000000-0000-4000-8000-000000000011', 'test_clerk_beta_owner',      'owner@beta.test',      'Bella',  'Bossworth'),
    ('b0000000-0000-4000-8000-000000000012', 'test_clerk_beta_counselor',  'counselor@beta.test',  'Ben',    'Advisor'),
    ('b0000000-0000-4000-8000-000000000013', 'test_clerk_beta_parent1',    'parent1@beta.test',    'Pia',    'Guardian'),
    ('b0000000-0000-4000-8000-000000000014', 'test_clerk_beta_parent2',    'parent2@beta.test',    'Pablo',  'Guardian'),
    ('b0000000-0000-4000-8000-000000000015', 'test_clerk_beta_student',    'student@beta.test',    'Stella', 'Scholar')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Firm memberships
-- ---------------------------------------------------------------------------
INSERT INTO firm_memberships (firm_id, user_id, role, status, joined_at) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000011', 'firm_owner',      'active', now()),
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000012', 'counselor',       'active', now()),
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000013', 'parent_guardian', 'active', now()),
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000014', 'parent_guardian', 'active', now()),
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000015', 'student',         'active', now()),
    ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000011', 'firm_owner',      'active', now()),
    ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000012', 'counselor',       'active', now()),
    ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000013', 'parent_guardian', 'active', now()),
    ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000014', 'parent_guardian', 'active', now()),
    ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000015', 'student',         'active', now())
ON CONFLICT (firm_id, user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Families and members
-- ---------------------------------------------------------------------------
INSERT INTO families (id, firm_id, household_name, created_by_user_id, updated_by_user_id) VALUES
    ('a0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000001', 'Parent Household',
     'a0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000012'),
    ('b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000001', 'Guardian Household',
     'b0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000012')
ON CONFLICT (id) DO NOTHING;

INSERT INTO family_members (id, firm_id, family_id, user_id, relationship_type, is_primary_contact) VALUES
    ('a0000000-0000-4000-8000-000000000031', 'a0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000013', 'parent', true),
    ('a0000000-0000-4000-8000-000000000032', 'a0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000014', 'parent', false),
    ('b0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000013', 'parent', true),
    ('b0000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000014', 'parent', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Students (10th graders) + empty profiles + counselor assignments
-- ---------------------------------------------------------------------------
INSERT INTO students (id, firm_id, family_id, user_id, first_name, last_name, graduation_year,
                      school_name, created_by_user_id, updated_by_user_id) VALUES
    ('a0000000-0000-4000-8000-000000000041', 'a0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000015',
     'Sam', 'Studentson', extract(year from now())::int + 2, 'Alpha High School',
     'a0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000012'),
    ('b0000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000015',
     'Stella', 'Scholar', extract(year from now())::int + 2, 'Beta Preparatory',
     'b0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000012')
ON CONFLICT (id) DO NOTHING;

INSERT INTO student_profiles (firm_id, student_id) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000041'),
    ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000041')
ON CONFLICT (student_id) DO NOTHING;

INSERT INTO student_staff_assignments (firm_id, student_id, user_id, assignment_type, is_primary) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000041',
     'a0000000-0000-4000-8000-000000000012', 'counselor', true),
    ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000041',
     'b0000000-0000-4000-8000-000000000012', 'counselor', true)
ON CONFLICT (student_id, user_id, assignment_type) DO NOTHING;
