import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid();

export const emailSchema = z.string().email().toLowerCase();

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  perPage: z.number().int().positive().max(100).default(20),
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const visibilityScopeSchema = z.enum([
  "firm",
  "counselor",
  "family",
  "student",
  "private",
]);

export const firmRoleSchema = z.enum([
  "firm_owner",
  "firm_admin",
  "counselor",
  "essay_coach",
  "tutor",
  "read_only_staff",
  "student",
  "parent_guardian",
]);

// ---------------------------------------------------------------------------
// Entity creation schemas
// ---------------------------------------------------------------------------

export const createFirmSchema = z.object({
  name: z
    .string()
    .min(2, "Firm name must be at least 2 characters")
    .max(100, "Firm name must be at most 100 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(60, "Slug must be at most 60 characters")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain only lowercase letters, numbers, and hyphens"
    ),
});

export const createStudentSchema = z.object({
  first_name: z
    .string()
    .min(1, "First name is required")
    .max(100, "First name must be at most 100 characters"),
  last_name: z
    .string()
    .min(1, "Last name is required")
    .max(100, "Last name must be at most 100 characters"),
  graduation_year: z
    .number()
    .int()
    .min(2000, "Graduation year must be 2000 or later")
    .max(2100, "Graduation year must be 2100 or earlier"),
  family_id: uuidSchema,
  firm_id: uuidSchema,
});

export const createFamilySchema = z.object({
  household_name: z
    .string()
    .min(1, "Household name is required")
    .max(150, "Household name must be at most 150 characters"),
  firm_id: uuidSchema,
});

export const createTaskSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(255, "Title must be at most 255 characters"),
  firm_id: uuidSchema,
  description: z.string().max(5000).optional(),
  due_date: z.string().datetime().optional(),
  student_id: uuidSchema.optional(),
  assigned_to: uuidSchema.optional(),
  status: z
    .enum(["pending", "in_progress", "completed", "cancelled"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  visibility_scope: visibilityScopeSchema.optional(),
});

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export const workflowStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "completed",
  "cancelled",
  "paused",
]);

export const stepStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "skipped",
  "blocked",
]);

export const stepVisibilityScopeSchema = z.enum(["staff", "student", "family"]);

export const gradeLevelSchema = z.enum([
  "freshman",
  "sophomore",
  "junior",
  "senior",
  "any",
]);

export const instantiationScopeSchema = z.enum(["student", "student_college"]);

const trimmedString = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max);

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v: string | undefined) => (v === "" ? undefined : v));

export const createWorkflowTemplateSchema = z.object({
  name: trimmedString(120),
  workflow_type: trimmedString(60),
  description: optionalTrimmedString(2000),
  category: optionalTrimmedString(60),
  grade_level: gradeLevelSchema.optional(),
  instantiation_scope: instantiationScopeSchema.optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

export const updateWorkflowTemplateSchema = createWorkflowTemplateSchema.partial();

export const createTemplateStepSchema = z.object({
  workflow_template_id: uuidSchema,
  name: trimmedString(255),
  step_order: z.number().int().min(0),
  step_type: trimmedString(60),
  description: optionalTrimmedString(2000),
  task_type: optionalTrimmedString(60),
  default_assignee_role: firmRoleSchema.optional(),
  default_due_offset_days: z.number().int().min(-365).max(3650).optional(),
  depends_on_step_id: uuidSchema.optional(),
  is_required: z.boolean().optional(),
  visibility_scope: stepVisibilityScopeSchema.optional(),
});

export const updateTemplateStepSchema = createTemplateStepSchema
  .omit({ workflow_template_id: true })
  .partial();

export const reorderTemplateStepsSchema = z.object({
  template_id: uuidSchema,
  ordered_step_ids: z.array(uuidSchema).min(1),
});

export const applyWorkflowToStudentSchema = z.object({
  template_id: uuidSchema,
  student_id: uuidSchema,
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD")
    .optional(),
  student_college_id: uuidSchema.optional(),
  name: optionalTrimmedString(120),
  description: optionalTrimmedString(2000),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Pagination = z.infer<typeof paginationSchema>;
export type VisibilityScope = z.infer<typeof visibilityScopeSchema>;
export type FirmRole = z.infer<typeof firmRoleSchema>;
export type CreateFirm = z.infer<typeof createFirmSchema>;
export type CreateStudent = z.infer<typeof createStudentSchema>;
export type CreateFamily = z.infer<typeof createFamilySchema>;
export type CreateTask = z.infer<typeof createTaskSchema>;
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;
export type StepStatus = z.infer<typeof stepStatusSchema>;
export type CreateWorkflowTemplate = z.infer<typeof createWorkflowTemplateSchema>;
export type UpdateWorkflowTemplate = z.infer<typeof updateWorkflowTemplateSchema>;
export type CreateTemplateStep = z.infer<typeof createTemplateStepSchema>;
export type UpdateTemplateStep = z.infer<typeof updateTemplateStepSchema>;
export type ReorderTemplateSteps = z.infer<typeof reorderTemplateStepsSchema>;
export type ApplyWorkflowToStudent = z.infer<typeof applyWorkflowToStudentSchema>;
