export type WorkflowStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled' | 'paused';

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';

export interface WorkflowTemplate {
  id: string;
  firm_id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  is_default: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplateStep {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  step_order: number;
  default_assignee_role: string | null;
  days_offset: number | null;
  depends_on_step_id: string | null;
  is_required: boolean;
  task_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentWorkflow {
  id: string;
  firm_id: string;
  student_id: string;
  template_id: string | null;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  started_at: string | null;
  completed_at: string | null;
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface StudentWorkflowStep {
  id: string;
  workflow_id: string;
  template_step_id: string | null;
  title: string;
  description: string | null;
  step_order: number;
  status: StepStatus;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  linked_task_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplateWithSteps extends WorkflowTemplate {
  workflow_template_steps: WorkflowTemplateStep[];
}

export interface StudentWorkflowWithSteps extends StudentWorkflow {
  student_workflow_steps: StudentWorkflowStep[];
}

export type CreateWorkflowTemplateInput = Pick<WorkflowTemplate, 'firm_id' | 'name' | 'created_by'> &
  Partial<Pick<WorkflowTemplate, 'description' | 'category' | 'is_default'>>;

export type CreateStudentWorkflowInput = Pick<StudentWorkflow, 'firm_id' | 'student_id' | 'name' | 'created_by'> &
  Partial<Pick<StudentWorkflow, 'template_id' | 'description' | 'due_date'>>;
