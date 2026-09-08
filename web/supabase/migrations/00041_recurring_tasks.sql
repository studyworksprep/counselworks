-- ===========================================================================
-- Recurring tasks (fix plan 13.3)
-- ===========================================================================
-- A staff member saves a repeating task template (weekly on a weekday, or
-- monthly on a day of the month); the app materializes one ordinary `tasks`
-- row per occurrence — on save for the first occurrence, then from the
-- daily Inngest cron (src/lib/tasks/materialize-recurring.ts). Generated
-- tasks ride every existing task surface (staff list, dashboards, student and
-- family portals by visibility_scope). Templates themselves are staff-only.

-- ---------------------------------------------------------------------------
-- 1. Templates
-- ---------------------------------------------------------------------------
CREATE TABLE recurring_task_templates (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id              uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    title                text NOT NULL,
    description          text,
    task_type            text NOT NULL DEFAULT 'general',
    priority             text NOT NULL DEFAULT 'medium',
    -- Same audience values as tasks.visibility_scope; copied onto every
    -- generated task. Portal-visible templates must name a student.
    visibility_scope     text NOT NULL DEFAULT 'staff'
                             CHECK (visibility_scope IN ('staff', 'student', 'family')),
    -- Explicit assignee; when null the materializer falls back to the
    -- student's primary counselor, then to the template's creator.
    assigned_user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
    -- Null = a firm-level task for the assignee (never portal-visible).
    student_id           uuid REFERENCES students(id) ON DELETE CASCADE,
    cadence              text NOT NULL CHECK (cadence IN ('weekly', 'monthly')),
    weekday              smallint CHECK (weekday BETWEEN 0 AND 6),      -- weekly: 0 = Sunday
    day_of_month         smallint CHECK (day_of_month BETWEEN 1 AND 28), -- monthly: 1–28 so every month has it
    starts_on            date NOT NULL DEFAULT current_date,
    -- Last occurrence date (firm-local calendar date) that has been
    -- materialized; the cron resumes from the day after it.
    last_materialized_on date,
    active               boolean NOT NULL DEFAULT true,
    created_by_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    archived_at          timestamptz,
    CHECK ((cadence = 'weekly' AND weekday IS NOT NULL)
        OR (cadence = 'monthly' AND day_of_month IS NOT NULL)),
    CHECK (visibility_scope = 'staff' OR student_id IS NOT NULL)
);

CREATE INDEX idx_recurring_task_templates_firm_id
    ON recurring_task_templates(firm_id);
CREATE INDEX idx_recurring_task_templates_firm_student
    ON recurring_task_templates(firm_id, student_id);
-- The cron's scan: every live, active template across all firms.
CREATE INDEX idx_recurring_task_templates_active
    ON recurring_task_templates(active) WHERE archived_at IS NULL;

CREATE TRIGGER trg_recurring_task_templates_set_updated_at
    BEFORE UPDATE ON recurring_task_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE recurring_task_templates ENABLE ROW LEVEL SECURITY;

-- Staff-only read AND write: portals never list templates, they only ever
-- see the generated tasks (which carry their own visibility_scope).
CREATE POLICY recurring_task_templates_staff_access ON recurring_task_templates
    FOR ALL
    USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());

-- ---------------------------------------------------------------------------
-- 2. Tasks: provenance of a generated occurrence
-- ---------------------------------------------------------------------------
-- Read by the staff task table ("Recurring" badge linking back to the
-- template); written only by the materializer.
ALTER TABLE tasks
    ADD COLUMN recurring_template_id uuid
        REFERENCES recurring_task_templates(id) ON DELETE SET NULL,
    ADD COLUMN occurrence_on date;

-- Idempotency guarantee: a cron re-run, an overlapping manual run, or an
-- Inngest retry can never create a second task for the same occurrence.
CREATE UNIQUE INDEX idx_tasks_recurring_occurrence
    ON tasks(recurring_template_id, occurrence_on)
    WHERE recurring_template_id IS NOT NULL;
