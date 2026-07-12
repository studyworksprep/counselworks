-- ===========================================================================
-- Default workflow auto-assignment on intake (fix plan Phase 10, item 10.8)
-- ===========================================================================
-- When set, creating a student automatically instantiates this workflow
-- template for them. Configured by admins in Settings.

ALTER TABLE firm_settings
    ADD COLUMN default_workflow_template_id uuid
    REFERENCES workflow_templates(id) ON DELETE SET NULL;
