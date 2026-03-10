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
// Inferred types
// ---------------------------------------------------------------------------

export type Pagination = z.infer<typeof paginationSchema>;
export type VisibilityScope = z.infer<typeof visibilityScopeSchema>;
export type FirmRole = z.infer<typeof firmRoleSchema>;
export type CreateFirm = z.infer<typeof createFirmSchema>;
export type CreateStudent = z.infer<typeof createStudentSchema>;
export type CreateFamily = z.infer<typeof createFamilySchema>;
export type CreateTask = z.infer<typeof createTaskSchema>;
