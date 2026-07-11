-- ===========================================================================
-- Student status normalization (fix plan Phase 7, items 7.4 + 7.5)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. One vocabulary: active / paused / graduated / archived
-- ---------------------------------------------------------------------------
-- The roster filter and badges used "paused" while the edit form wrote
-- "inactive" — an "inactive" student vanished from the Paused filter and
-- rendered an unknown gray badge. The shared constants module
-- (src/lib/constants/students.ts) is the single source of truth; remap
-- existing rows to it.
UPDATE students SET status = 'paused' WHERE status = 'inactive';

-- The edit form could also set status = 'archived' WITHOUT stamping
-- archived_at, so "archived" students stayed in the roster (which filters on
-- archived_at). Reconcile: an archived status means an archived record.
UPDATE students
SET archived_at = COALESCE(archived_at, now())
WHERE status = 'archived';

-- And the reverse: a record archived via archiveStudent always got both, but
-- guard against any drifted rows so the invariant holds in both directions.
UPDATE students
SET status = 'archived'
WHERE archived_at IS NOT NULL AND status <> 'archived';

-- Anything outside the vocabulary (e.g. legacy 'prospective') has no filter,
-- badge, or writer in the app — fold it into 'active' before constraining.
UPDATE students
SET status = 'active'
WHERE status NOT IN ('active', 'paused', 'graduated', 'archived');

-- ---------------------------------------------------------------------------
-- 2. Enforce the enum so a second spelling can never come back
-- ---------------------------------------------------------------------------
ALTER TABLE students
    ADD CONSTRAINT students_status_check
    CHECK (status IN ('active', 'paused', 'graduated', 'archived'));
