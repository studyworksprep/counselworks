/**
 * Workflow template enums (workflow_templates.workflow_type and .grade_level,
 * workflow_template_steps.step_type): one spelling for the template forms,
 * the validators in lib/validation/schemas.ts, and every label (CLAUDE.md
 * rule 4). The new-template form, the template detail page, and the
 * templates list each kept their own copy.
 *
 * workflow_templates.category is free text (system templates store tokens
 * such as "anchors"), so it has no label map: pages show it through
 * humanizeToken.
 */

export const WORKFLOW_TYPE_OPTIONS = [
  { value: "application", label: "Application cycle" },
  { value: "essay", label: "Essay process" },
  { value: "testing", label: "Testing & prep" },
  { value: "financial_aid", label: "Financial aid" },
  { value: "general", label: "General" },
] as const;

export const WORKFLOW_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  WORKFLOW_TYPE_OPTIONS.map((o) => [o.value, o.label])
);

/**
 * `heading` titles the templates list's grade sections, which read as a
 * high-school timeline; `label` is the short form for badges.
 */
export const WORKFLOW_GRADE_LEVELS = [
  { value: "freshman", label: "Freshman", heading: "9th Grade · Freshman" },
  { value: "sophomore", label: "Sophomore", heading: "10th Grade · Sophomore" },
  { value: "junior", label: "Junior", heading: "11th Grade · Junior" },
  { value: "senior", label: "Senior", heading: "12th Grade · Senior" },
  { value: "any", label: "Any grade", heading: "Anytime" },
] as const;

export const WORKFLOW_GRADE_LEVEL_LABELS: Record<string, string> =
  Object.fromEntries(WORKFLOW_GRADE_LEVELS.map((g) => [g.value, g.label]));

export const WORKFLOW_STEP_TYPE_OPTIONS = [
  { value: "task", label: "Task" },
  { value: "milestone", label: "Milestone" },
  { value: "review", label: "Review" },
  { value: "deadline", label: "Deadline" },
] as const;

export const WORKFLOW_STEP_TYPE_LABELS: Record<string, string> =
  Object.fromEntries(WORKFLOW_STEP_TYPE_OPTIONS.map((o) => [o.value, o.label]));
