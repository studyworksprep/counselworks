-- ===========================================================================
-- Family (parent/guardian) portal invitations — fix plan Phase 2
-- ===========================================================================
-- Mirrors the student invitation flow (00015) for family members. At invite
-- time the app pre-creates/reuses the member's placeholder `users` row
-- (auth_provider_user_id = 'invited_<uuid>') and pre-stages a
-- `firm_memberships(role='parent_guardian', status='active')` row, so the
-- claim paths (Clerk webhook / resolveUserAndFirm) route the parent straight
-- into the family portal on first sign-in.

CREATE TABLE family_invitations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    family_id           uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    family_member_id    uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
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

CREATE INDEX idx_family_invitations_firm_id ON family_invitations(firm_id);
CREATE INDEX idx_family_invitations_family_id ON family_invitations(family_id);
CREATE INDEX idx_family_invitations_status ON family_invitations(status);

-- Only one pending invitation per family member at a time.
CREATE UNIQUE INDEX idx_family_invitations_one_pending_per_member
    ON family_invitations(family_member_id)
    WHERE status = 'pending';

CREATE TRIGGER trg_family_invitations_set_updated_at
    BEFORE UPDATE ON family_invitations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE family_invitations ENABLE ROW LEVEL SECURITY;

-- Same shape as the 00016 staff-managed tables: firm members read,
-- staff write.
CREATE POLICY family_invitations_member_read ON family_invitations
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY family_invitations_staff_write ON family_invitations
    FOR ALL
    USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());

-- ---------------------------------------------------------------------------
-- Unify placeholder prefixes: 'pending_' → 'invited_'
-- ---------------------------------------------------------------------------
-- addFamilyMember historically created contacts with a 'pending_' prefix
-- that no claim path recognized, stranding those users forever. Both claim
-- paths (Clerk webhook and resolveUserAndFirm) match 'invited_', so rename
-- the legacy rows. These are placeholders — they have never authenticated,
-- so nothing references the old identifier outside this column.
UPDATE users
SET auth_provider_user_id = 'invited_' || substr(auth_provider_user_id, 9)
WHERE auth_provider_user_id LIKE 'pending\_%';
