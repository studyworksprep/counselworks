-- One ACTIVE firm_owner membership per user.
--
-- Auto-provisioning (src/lib/auth/resolve.ts) creates a firm + owner
-- membership when a signed-in user has none. A first sign-in arrives as
-- several concurrent requests; they all miss the membership lookup and each
-- provisioned a firm — observed in production on 2026-08-12 as three
-- duplicate firms created 449ms apart. The user-row half of this race is
-- already guarded by users_auth_provider_user_id_key; this index is the
-- firm-side counterpart that makes every loser fail loudly on the
-- membership insert, where the app adopts the winner and removes its own
-- orphan firm.
--
-- Partial on (role, status): invited staff/portal roles are unaffected, and
-- a deactivated ownership does not block re-provisioning. firm_owner is only
-- ever granted by auto-provisioning, so "one active ownership per user" is
-- an invariant of the product, not a new policy.

-- De-dupe so the index can build anywhere a race already left duplicates:
-- keep each user's oldest active owner membership — the row every resolver
-- (public.firm_id() and resolveUserAndFirm) already selects — and drop the
-- newer ones. Orphaned firms are left in place: deleting tenant data in a
-- migration is not worth the risk, and an unreferenced firm is inert.
DELETE FROM firm_memberships fm
USING firm_memberships keep
WHERE fm.user_id = keep.user_id
  AND fm.role = 'firm_owner' AND fm.status = 'active'
  AND keep.role = 'firm_owner' AND keep.status = 'active'
  AND (keep.created_at < fm.created_at
       OR (keep.created_at = fm.created_at AND keep.id < fm.id));

CREATE UNIQUE INDEX IF NOT EXISTS firm_memberships_one_active_owner_per_user
    ON firm_memberships (user_id)
    WHERE role = 'firm_owner' AND status = 'active';
