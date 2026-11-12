-- Keep the rejected proposal and its feedback as a record. A revision is made
-- through the existing Duplicate as new draft flow, preserving this response.
ALTER TABLE public.proposals
  DROP CONSTRAINT proposals_status_check,
  DROP CONSTRAINT proposals_link_matches_status,
  ADD COLUMN rejected_at timestamptz,
  ADD COLUMN rejection_comment text,
  ADD CONSTRAINT proposals_status_check
    CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'withdrawn')),
  ADD CONSTRAINT proposals_link_matches_status CHECK (
    (status IN ('draft', 'withdrawn') AND public_token IS NULL)
    OR (status IN ('sent', 'approved', 'rejected') AND public_token IS NOT NULL AND sent_at IS NOT NULL)
  ),
  ADD CONSTRAINT proposals_rejection_evidence CHECK (
    (rejected_at IS NULL AND rejection_comment IS NULL AND status <> 'rejected')
    OR (rejected_at IS NOT NULL AND rejection_comment IS NOT NULL
        AND length(btrim(rejection_comment)) BETWEEN 1 AND 5000
        AND status IN ('rejected', 'withdrawn') AND approved_at IS NULL)
  );
-- Existing staff-only tenant RLS is unchanged. Public responses remain secret-
-- token authorized and compare status + updated_at in one conditional UPDATE.
