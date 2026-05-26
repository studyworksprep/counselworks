-- ===========================================================================
-- Extend workflows schema to support the full feature set:
--   - template metadata (description, category, active/default flags, author)
--   - richer template steps (description, role-based default assignee,
--     dependencies, required flag, downstream task type)
--   - student workflow instance metadata (name, due date, author, ad-hoc
--     workflows without a template)
--   - student workflow step overrides + linkage to tasks
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- workflow_templates
-- ---------------------------------------------------------------------------
ALTER TABLE workflow_templates
    ADD COLUMN IF NOT EXISTS description         text,
    ADD COLUMN IF NOT EXISTS category             text,
    ADD COLUMN IF NOT EXISTS is_active            boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS is_default           boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_by_user_id   uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_templates_firm_id_category
    ON workflow_templates(firm_id, category);

-- ---------------------------------------------------------------------------
-- workflow_template_steps
-- ---------------------------------------------------------------------------
ALTER TABLE workflow_template_steps
    ADD COLUMN IF NOT EXISTS description            text,
    ADD COLUMN IF NOT EXISTS default_assignee_role  text,
    ADD COLUMN IF NOT EXISTS depends_on_step_id     uuid REFERENCES workflow_template_steps(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_required            boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS task_type              text;

CREATE INDEX IF NOT EXISTS idx_workflow_template_steps_depends_on
    ON workflow_template_steps(depends_on_step_id)
    WHERE depends_on_step_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- student_workflows
-- ---------------------------------------------------------------------------
-- Allow ad-hoc student workflows that are not derived from a template.
ALTER TABLE student_workflows
    ALTER COLUMN workflow_template_id DROP NOT NULL;

ALTER TABLE student_workflows
    ADD COLUMN IF NOT EXISTS name                 text,
    ADD COLUMN IF NOT EXISTS description          text,
    ADD COLUMN IF NOT EXISTS due_date             date,
    ADD COLUMN IF NOT EXISTS created_by_user_id   uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_workflows_firm_id_status
    ON student_workflows(firm_id, status);

-- ---------------------------------------------------------------------------
-- student_workflow_steps
-- ---------------------------------------------------------------------------
ALTER TABLE student_workflow_steps
    ADD COLUMN IF NOT EXISTS title                  text,
    ADD COLUMN IF NOT EXISTS description            text,
    ADD COLUMN IF NOT EXISTS step_order             int,
    ADD COLUMN IF NOT EXISTS completed_by_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS linked_task_id         uuid REFERENCES tasks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notes                  text;

CREATE INDEX IF NOT EXISTS idx_student_workflow_steps_order
    ON student_workflow_steps(student_workflow_id, step_order);

CREATE INDEX IF NOT EXISTS idx_student_workflow_steps_linked_task
    ON student_workflow_steps(linked_task_id)
    WHERE linked_task_id IS NOT NULL;
