-- ===========================================================================
-- Student portal invitations
-- ===========================================================================
-- Tracks invitations sent to students who already have a roster record but
-- no portal account yet. At invite time we pre-create:
--   1. a placeholder `users` row (auth_provider_user_id = 'invited_<uuid>')
--   2. a `firm_memberships(role='student', status='active')` row
--   3. set `students.user_id` to the placeholder
-- so that when the student first authenticates, `resolveUserAndFirm` claims
-- the placeholder by Clerk invitation metadata and the membership is already
-- in place (no race against the auto-provisioning branch).
-- ===========================================================================

CREATE TABLE student_invitations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    student_id          uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    placeholder_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email               text NOT NULL,
    clerk_invitation_id text NOT NULL UNIQUE,
    status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    sent_by_user_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sent_at             timestamptz NOT NULL DEFAULT now(),
    accepted_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_invitations_firm_id ON student_invitations(firm_id);
CREATE INDEX idx_student_invitations_student_id ON student_invitations(student_id);
CREATE INDEX idx_student_invitations_status ON student_invitations(status);

-- Only one pending invitation per student at a time.
CREATE UNIQUE INDEX idx_student_invitations_one_pending_per_student
    ON student_invitations(student_id)
    WHERE status = 'pending';

ALTER TABLE student_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_invitations_tenant_access ON student_invitations
    USING (firm_id = public.firm_id());
