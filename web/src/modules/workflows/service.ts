import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateStudentWorkflowInput,
  CreateWorkflowTemplateInput,
  CreateWorkflowTemplateStepInput,
  StepStatus,
  StudentWorkflow,
  StudentWorkflowStep,
  StudentWorkflowWithSteps,
  UpdateStudentWorkflowStepInput,
  UpdateWorkflowTemplateInput,
  UpdateWorkflowTemplateStepInput,
  WorkflowStatus,
  WorkflowTemplate,
  WorkflowTemplateStep,
  WorkflowTemplateWithSteps,
} from './types';

// ===========================================================================
// Templates
// ===========================================================================

export async function getTemplatesByFirm(
  client: SupabaseClient,
  firmId: string,
  options?: { includeSystem?: boolean; category?: string; activeOnly?: boolean },
): Promise<{ data: WorkflowTemplate[]; error: Error | null }> {
  const includeSystem = options?.includeSystem ?? true;

  let query = client.from('workflow_templates').select('*');

  if (includeSystem) {
    query = query.or(`firm_id.eq.${firmId},is_system_template.eq.true`);
  } else {
    query = query.eq('firm_id', firmId);
  }

  if (options?.category) {
    query = query.eq('category', options.category);
  }

  if (options?.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query
    .order('is_system_template', { ascending: true })
    .order('name', { ascending: true });

  return { data: (data as WorkflowTemplate[]) ?? [], error };
}

export async function getTemplateById(
  client: SupabaseClient,
  templateId: string,
): Promise<{ data: WorkflowTemplate | null; error: Error | null }> {
  const { data, error } = await client
    .from('workflow_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  return { data: data as WorkflowTemplate | null, error };
}

export async function getTemplateWithSteps(
  client: SupabaseClient,
  templateId: string,
): Promise<{ data: WorkflowTemplateWithSteps | null; error: Error | null }> {
  const { data, error } = await client
    .from('workflow_templates')
    .select('*, workflow_template_steps(*)')
    .eq('id', templateId)
    .single();

  if (data && Array.isArray((data as WorkflowTemplateWithSteps).workflow_template_steps)) {
    (data as WorkflowTemplateWithSteps).workflow_template_steps.sort(
      (a, b) => a.step_order - b.step_order,
    );
  }

  return { data: data as WorkflowTemplateWithSteps | null, error };
}

export async function createTemplate(
  client: SupabaseClient,
  input: CreateWorkflowTemplateInput,
): Promise<{ data: WorkflowTemplate | null; error: Error | null }> {
  const { data, error } = await client
    .from('workflow_templates')
    .insert({
      ...input,
      is_active: input.is_active ?? true,
      is_default: input.is_default ?? false,
    })
    .select('*')
    .single();

  return { data: data as WorkflowTemplate | null, error };
}

export async function updateTemplate(
  client: SupabaseClient,
  templateId: string,
  input: UpdateWorkflowTemplateInput,
): Promise<{ data: WorkflowTemplate | null; error: Error | null }> {
  const { data, error } = await client
    .from('workflow_templates')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', templateId)
    .select('*')
    .single();

  return { data: data as WorkflowTemplate | null, error };
}

export async function archiveTemplate(
  client: SupabaseClient,
  templateId: string,
): Promise<{ data: WorkflowTemplate | null; error: Error | null }> {
  return updateTemplate(client, templateId, { is_active: false });
}

// ===========================================================================
// Template steps
// ===========================================================================

export async function getStepsByTemplate(
  client: SupabaseClient,
  templateId: string,
): Promise<{ data: WorkflowTemplateStep[]; error: Error | null }> {
  const { data, error } = await client
    .from('workflow_template_steps')
    .select('*')
    .eq('workflow_template_id', templateId)
    .order('step_order', { ascending: true });

  return { data: (data as WorkflowTemplateStep[]) ?? [], error };
}

export async function createTemplateStep(
  client: SupabaseClient,
  input: CreateWorkflowTemplateStepInput,
): Promise<{ data: WorkflowTemplateStep | null; error: Error | null }> {
  const { data, error } = await client
    .from('workflow_template_steps')
    .insert({
      ...input,
      is_required: input.is_required ?? true,
      visibility_scope: input.visibility_scope ?? 'staff',
    })
    .select('*')
    .single();

  return { data: data as WorkflowTemplateStep | null, error };
}

export async function updateTemplateStep(
  client: SupabaseClient,
  stepId: string,
  input: UpdateWorkflowTemplateStepInput,
): Promise<{ data: WorkflowTemplateStep | null; error: Error | null }> {
  const { data, error } = await client
    .from('workflow_template_steps')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', stepId)
    .select('*')
    .single();

  return { data: data as WorkflowTemplateStep | null, error };
}

export async function deleteTemplateStep(
  client: SupabaseClient,
  stepId: string,
): Promise<{ data: null; error: Error | null }> {
  const { error } = await client
    .from('workflow_template_steps')
    .delete()
    .eq('id', stepId);

  return { data: null, error };
}

export async function reorderTemplateSteps(
  client: SupabaseClient,
  templateId: string,
  orderedStepIds: string[],
): Promise<{ data: null; error: Error | null }> {
  const now = new Date().toISOString();

  // Two-phase update so the unique-ish ordering doesn't collide if a future
  // unique index is added on (workflow_template_id, step_order). First push
  // the rows out into a non-overlapping range, then assign final positions.
  const offset = orderedStepIds.length + 1;
  for (let i = 0; i < orderedStepIds.length; i++) {
    const { error } = await client
      .from('workflow_template_steps')
      .update({ step_order: offset + i, updated_at: now })
      .eq('id', orderedStepIds[i])
      .eq('workflow_template_id', templateId);
    if (error) return { data: null, error };
  }

  for (let i = 0; i < orderedStepIds.length; i++) {
    const { error } = await client
      .from('workflow_template_steps')
      .update({ step_order: i, updated_at: now })
      .eq('id', orderedStepIds[i])
      .eq('workflow_template_id', templateId);
    if (error) return { data: null, error };
  }

  return { data: null, error: null };
}

// ===========================================================================
// Student workflow instances
// ===========================================================================

export async function getStudentWorkflowsByFirm(
  client: SupabaseClient,
  firmId: string,
  options?: { studentId?: string; status?: WorkflowStatus },
): Promise<{ data: StudentWorkflow[]; error: Error | null }> {
  let query = client
    .from('student_workflows')
    .select('*')
    .eq('firm_id', firmId);

  if (options?.studentId) {
    query = query.eq('student_id', options.studentId);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  return { data: (data as StudentWorkflow[]) ?? [], error };
}

export async function getStudentWorkflowById(
  client: SupabaseClient,
  workflowId: string,
): Promise<{ data: StudentWorkflow | null; error: Error | null }> {
  const { data, error } = await client
    .from('student_workflows')
    .select('*')
    .eq('id', workflowId)
    .single();

  return { data: data as StudentWorkflow | null, error };
}

export async function getStudentWorkflowWithSteps(
  client: SupabaseClient,
  workflowId: string,
): Promise<{ data: StudentWorkflowWithSteps | null; error: Error | null }> {
  const { data, error } = await client
    .from('student_workflows')
    .select('*, student_workflow_steps(*)')
    .eq('id', workflowId)
    .single();

  if (data && Array.isArray((data as StudentWorkflowWithSteps).student_workflow_steps)) {
    (data as StudentWorkflowWithSteps).student_workflow_steps.sort(
      (a, b) => (a.step_order ?? 0) - (b.step_order ?? 0),
    );
  }

  return { data: data as StudentWorkflowWithSteps | null, error };
}

export async function createStudentWorkflow(
  client: SupabaseClient,
  input: CreateStudentWorkflowInput,
): Promise<{ data: StudentWorkflow | null; error: Error | null }> {
  const { data, error } = await client
    .from('student_workflows')
    .insert({ ...input, status: 'not_started' })
    .select('*')
    .single();

  return { data: data as StudentWorkflow | null, error };
}

export async function updateStudentWorkflowStatus(
  client: SupabaseClient,
  workflowId: string,
  status: WorkflowStatus,
): Promise<{ data: StudentWorkflow | null; error: Error | null }> {
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status, updated_at: now };

  if (status === 'in_progress') updates.started_at = now;
  if (status === 'completed') updates.completed_at = now;

  const { data, error } = await client
    .from('student_workflows')
    .update(updates)
    .eq('id', workflowId)
    .select('*')
    .single();

  return { data: data as StudentWorkflow | null, error };
}

// ---------------------------------------------------------------------------
// Instantiate a workflow from a template
// ---------------------------------------------------------------------------

export interface InstantiateWorkflowOptions {
  firmId: string;
  studentId: string;
  templateId: string;
  startDate: Date;
  createdByUserId: string;
  name?: string;
  description?: string;
  /**
   * Map of template step id -> user id, used to override the default
   * role-based assignee resolution. Pass an empty object for "no overrides".
   */
  assigneeOverrides?: Record<string, string>;
  /**
   * Map of role -> user id, used as the default resolution when a template
   * step has a `default_assignee_role`. The action layer typically populates
   * this from `student_staff_assignments`.
   */
  roleAssignees?: Record<string, string>;
}

export async function instantiateWorkflowFromTemplate(
  client: SupabaseClient,
  options: InstantiateWorkflowOptions,
): Promise<{ data: StudentWorkflowWithSteps | null; error: Error | null }> {
  const { data: template, error: templateError } = await getTemplateWithSteps(
    client,
    options.templateId,
  );
  if (templateError) return { data: null, error: templateError };
  if (!template) {
    return { data: null, error: new Error('Workflow template not found') };
  }

  const { data: workflow, error: workflowError } = await createStudentWorkflow(client, {
    firm_id: options.firmId,
    student_id: options.studentId,
    workflow_template_id: template.id,
    name: options.name ?? template.name,
    description: options.description ?? template.description ?? null,
    created_by_user_id: options.createdByUserId,
    due_date: computeWorkflowDueDate(options.startDate, template.workflow_template_steps),
  });
  if (workflowError || !workflow) {
    return { data: null, error: workflowError ?? new Error('Failed to create workflow') };
  }

  const stepRows = template.workflow_template_steps.map((templateStep) => {
    const override = options.assigneeOverrides?.[templateStep.id];
    const roleAssignee = templateStep.default_assignee_role
      ? options.roleAssignees?.[templateStep.default_assignee_role]
      : undefined;
    const initialStatus: StepStatus = templateStep.depends_on_step_id ? 'blocked' : 'pending';

    return {
      student_workflow_id: workflow.id,
      template_step_id: templateStep.id,
      status: initialStatus,
      step_order: templateStep.step_order,
      assigned_user_id: override ?? roleAssignee ?? null,
      due_date: addDays(options.startDate, templateStep.default_due_offset_days),
    };
  });

  if (stepRows.length === 0) {
    return {
      data: { ...workflow, student_workflow_steps: [] },
      error: null,
    };
  }

  const { data: insertedSteps, error: stepsError } = await client
    .from('student_workflow_steps')
    .insert(stepRows)
    .select('*');

  if (stepsError) {
    return { data: null, error: stepsError };
  }

  const sorted = ((insertedSteps as StudentWorkflowStep[]) ?? []).sort(
    (a, b) => (a.step_order ?? 0) - (b.step_order ?? 0),
  );

  return {
    data: { ...workflow, student_workflow_steps: sorted },
    error: null,
  };
}

// ===========================================================================
// Student workflow steps
// ===========================================================================

export async function getStudentWorkflowStepById(
  client: SupabaseClient,
  stepId: string,
): Promise<{ data: StudentWorkflowStep | null; error: Error | null }> {
  const { data, error } = await client
    .from('student_workflow_steps')
    .select('*')
    .eq('id', stepId)
    .single();

  return { data: data as StudentWorkflowStep | null, error };
}

export async function getStepByLinkedTask(
  client: SupabaseClient,
  taskId: string,
): Promise<{ data: StudentWorkflowStep | null; error: Error | null }> {
  const { data, error } = await client
    .from('student_workflow_steps')
    .select('*')
    .eq('linked_task_id', taskId)
    .maybeSingle();

  return { data: data as StudentWorkflowStep | null, error };
}

export async function updateStudentWorkflowStep(
  client: SupabaseClient,
  stepId: string,
  input: UpdateStudentWorkflowStepInput,
): Promise<{ data: StudentWorkflowStep | null; error: Error | null }> {
  const { data, error } = await client
    .from('student_workflow_steps')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', stepId)
    .select('*')
    .single();

  return { data: data as StudentWorkflowStep | null, error };
}

export async function completeStudentWorkflowStep(
  client: SupabaseClient,
  stepId: string,
  completedByUserId: string,
): Promise<{ data: StudentWorkflowStep | null; error: Error | null }> {
  const now = new Date().toISOString();
  return updateStudentWorkflowStep(client, stepId, {
    status: 'completed',
    completed_at: now,
    completed_by_user_id: completedByUserId,
  });
}

export async function skipStudentWorkflowStep(
  client: SupabaseClient,
  stepId: string,
): Promise<{ data: StudentWorkflowStep | null; error: Error | null }> {
  return updateStudentWorkflowStep(client, stepId, { status: 'skipped' });
}

// ---------------------------------------------------------------------------
// Dependency resolution
// ---------------------------------------------------------------------------

/**
 * Pure helper. Given a workflow's steps and the matching template steps,
 * return the ids of `blocked`/`pending` student steps whose template
 * prerequisite is now `completed` (or whose template has no prerequisite).
 *
 * The action layer typically calls this after a step is marked complete to
 * decide which downstream steps to activate.
 */
export function resolveActivatableStepIds(
  studentSteps: StudentWorkflowStep[],
  templateSteps: WorkflowTemplateStep[],
): string[] {
  const templateById = new Map(templateSteps.map((s) => [s.id, s]));
  const studentByTemplateId = new Map(
    studentSteps.map((s) => [s.template_step_id, s]),
  );

  const result: string[] = [];
  for (const step of studentSteps) {
    if (step.status !== 'blocked' && step.status !== 'pending') continue;

    const tmpl = templateById.get(step.template_step_id);
    if (!tmpl) continue;

    if (!tmpl.depends_on_step_id) {
      if (step.status === 'blocked') result.push(step.id);
      continue;
    }

    const prereqStudent = studentByTemplateId.get(tmpl.depends_on_step_id);
    if (prereqStudent?.status === 'completed' && step.status === 'blocked') {
      result.push(step.id);
    }
  }
  return result;
}

export async function activateSteps(
  client: SupabaseClient,
  stepIds: string[],
): Promise<{ data: null; error: Error | null }> {
  if (stepIds.length === 0) return { data: null, error: null };

  const { error } = await client
    .from('student_workflow_steps')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .in('id', stepIds);

  return { data: null, error };
}

// ===========================================================================
// Internal helpers
// ===========================================================================

function addDays(start: Date, offsetDays: number | null | undefined): string | null {
  if (offsetDays === null || offsetDays === undefined) return null;
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD for date column
}

function computeWorkflowDueDate(
  startDate: Date,
  steps: WorkflowTemplateStep[],
): string | null {
  let max: number | null = null;
  for (const s of steps) {
    if (s.default_due_offset_days !== null && s.default_due_offset_days !== undefined) {
      max = max === null ? s.default_due_offset_days : Math.max(max, s.default_due_offset_days);
    }
  }
  return addDays(startDate, max);
}
