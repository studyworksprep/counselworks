-- =============================================================================
-- Workflow templates: grade level + scoping
-- =============================================================================
-- Splits the workflow concept along two new axes:
--   1. grade_level (freshman/sophomore/junior/senior/any) so the templates
--      page can group by grade and counselors can scan by year.
--   2. instantiation_scope (student / student_college) so a single template
--      definition (e.g. "Supplement Essays for College") can be applied
--      multiple times to the same student, once per college.
--
-- Adds a nullable student_college_id on student_workflows so per-college
-- instances point at the specific college they're working through.
-- =============================================================================

ALTER TABLE workflow_templates
    ADD COLUMN IF NOT EXISTS grade_level         text,
    ADD COLUMN IF NOT EXISTS instantiation_scope text NOT NULL DEFAULT 'student';

CREATE INDEX IF NOT EXISTS idx_workflow_templates_grade_level
    ON workflow_templates(grade_level);

ALTER TABLE student_workflows
    ADD COLUMN IF NOT EXISTS student_college_id uuid
        REFERENCES student_colleges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_workflows_student_college_id
    ON student_workflows(student_college_id)
    WHERE student_college_id IS NOT NULL;
