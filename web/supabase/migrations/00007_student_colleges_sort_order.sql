-- Add sort_order to student_colleges for user-defined list ordering
ALTER TABLE student_colleges
    ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
