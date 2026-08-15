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
-- Firm settings (every provisioned firm has exactly one row — the app
-- creates it in onboarding.ts; fixtures must uphold the same invariant.
-- Conflict target is firm_id so an app-created row is left untouched.)
-- ---------------------------------------------------------------------------
INSERT INTO firm_settings (id, firm_id) VALUES
    ('a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-000000000001'),
    ('b0000000-0000-4000-8000-0000000000f1', 'b0000000-0000-4000-8000-000000000001')
ON CONFLICT (firm_id) DO NOTHING;

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

-- ---------------------------------------------------------------------------
-- Service agreements with fee terms + installment schedules (fix plan 12.1)
-- One sent agreement per firm: $12,000 total, $3,000 retainer, two $4,500
-- installments. Exercised by the isolation suite's billing checks.
-- ---------------------------------------------------------------------------
INSERT INTO service_agreements (id, firm_id, family_id, title, body_snapshot,
                                document_hash, status, created_by_user_id,
                                total_fee_cents, retainer_cents) VALUES
    ('a0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000021', 'Alpha Engagement Agreement',
     'Test engagement agreement body (Alpha).',
     'a1fa5eeda1fa5eeda1fa5eeda1fa5eeda1fa5eeda1fa5eeda1fa5eeda1fa5eed',
     'sent', 'a0000000-0000-4000-8000-000000000012', 1200000, 300000),
    ('b0000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-000000000021', 'Beta Engagement Agreement',
     'Test engagement agreement body (Beta).',
     'be7a5eedbe7a5eedbe7a5eedbe7a5eedbe7a5eedbe7a5eedbe7a5eedbe7a5eed',
     'sent', 'b0000000-0000-4000-8000-000000000012', 1200000, 300000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO agreement_installments (id, firm_id, agreement_id, installment_number,
                                    label, amount_cents, is_retainer, due_on) VALUES
    ('a0000000-0000-4000-8000-0000000000b2', 'a0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-0000000000b1', 1, 'Retainer (due at signing)', 300000, true,  NULL),
    ('a0000000-0000-4000-8000-0000000000b3', 'a0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-0000000000b1', 2, 'Installment 1 of 2',        450000, false, '2026-09-15'),
    ('a0000000-0000-4000-8000-0000000000b4', 'a0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-0000000000b1', 3, 'Installment 2 of 2',        450000, false, '2026-10-15'),
    ('b0000000-0000-4000-8000-0000000000b2', 'b0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-0000000000b1', 1, 'Retainer (due at signing)', 300000, true,  NULL),
    ('b0000000-0000-4000-8000-0000000000b3', 'b0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-0000000000b1', 2, 'Installment 1 of 2',        450000, false, '2026-09-15'),
    ('b0000000-0000-4000-8000-0000000000b4', 'b0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-0000000000b1', 3, 'Installment 2 of 2',        450000, false, '2026-10-15')
ON CONFLICT (id) DO NOTHING;

-- One invoice per firm (on the retainer installment), for the isolation
-- suite's tenancy checks (fix plan 12.3).
INSERT INTO invoices (id, firm_id, family_id, agreement_id, installment_id,
                      invoice_number, amount_cents, status, due_on) VALUES
    ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-0000000000b1',
     'a0000000-0000-4000-8000-0000000000b2', 'INV-0001', 300000, 'open', '2026-08-13'),
    ('b0000000-0000-4000-8000-0000000000c1', 'b0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-0000000000b1',
     'b0000000-0000-4000-8000-0000000000b2', 'INV-0001', 300000, 'open', '2026-08-13')
ON CONFLICT (id) DO NOTHING;

-- One payment per firm (on the fixture invoice) for the isolation suite's
-- tenancy checks (fix plan 12.4).
INSERT INTO payments (id, firm_id, family_id, invoice_id, amount_cents,
                      paid_by_user_id) VALUES
    ('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-0000000000c1',
     300000, 'a0000000-0000-4000-8000-000000000013'),
    ('b0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-0000000000c1',
     300000, 'b0000000-0000-4000-8000-000000000013')
ON CONFLICT (id) DO NOTHING;
