-- Preserve existing ownership; legacy intent cannot be inferred from visibility.
ALTER TABLE tasks ADD COLUMN owner_role text;
ALTER TABLE tasks ADD COLUMN owner_pending boolean NOT NULL DEFAULT false;
ALTER TABLE recurring_task_templates ADD COLUMN owner_role text;
-- Pending plans stay staff-only until an explicit resolution/publish action.
-- Existing tenant policies remain in force; the application additionally scopes
-- task mutation to the owner and student relationship (including service fallback).
CREATE POLICY tasks_pending_staff_read ON tasks AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (NOT owner_pending OR public.is_staff());
CREATE POLICY tasks_pending_staff_insert ON tasks AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT owner_pending OR public.is_staff());
CREATE POLICY tasks_pending_staff_update ON tasks AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (NOT owner_pending OR public.is_staff())
  WITH CHECK (NOT owner_pending OR public.is_staff());
