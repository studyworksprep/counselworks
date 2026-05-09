-- =============================================================================
-- Workflow steps: deadline anchoring
-- =============================================================================
-- Some workflow steps have due dates that aren't relative to the workflow
-- start (e.g. EA/ED submission, RD submission) — they're tied to specific
-- application deadlines or fixed calendar dates.
--
-- The new `deadline_anchor` column lets a template step opt out of the
-- default offset-based due-date computation. The action layer resolves the
-- anchor at instantiation time:
--   * 'earliest_ea_deadline' -> MIN(applications.deadline_at) where
--     application_type IN ('ea','ed','ed2','rea'); fallback Nov 1 of senior
--     year start (graduation_year - 1).
--   * 'earliest_rd_deadline' -> MIN(applications.deadline_at) where
--     application_type = 'rd'; fallback Jan 1 of graduation_year.
-- =============================================================================

ALTER TABLE workflow_template_steps
    ADD COLUMN IF NOT EXISTS deadline_anchor text;

UPDATE workflow_template_steps wts
SET deadline_anchor = 'earliest_ea_deadline',
    default_due_offset_days = NULL,
    updated_at = now()
FROM workflow_templates wt
WHERE wts.workflow_template_id = wt.id
  AND wt.is_system_template = true
  AND wt.name = 'Senior Year Anchors'
  AND wts.name = 'Early-action / early-decision deadline window';

UPDATE workflow_template_steps wts
SET deadline_anchor = 'earliest_rd_deadline',
    default_due_offset_days = NULL,
    updated_at = now()
FROM workflow_templates wt
WHERE wts.workflow_template_id = wt.id
  AND wt.is_system_template = true
  AND wt.name = 'Senior Year Anchors'
  AND wts.name = 'Regular-decision deadline window';
