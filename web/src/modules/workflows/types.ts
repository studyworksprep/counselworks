export type WorkflowStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled' | 'paused';

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';

export type StepVisibilityScope = 'staff' | 'student' | 'family';

export type GradeLevel = 'freshman' | 'sophomore' | 'junior' | 'senior' | 'any';

export type InstantiationScope = 'student' | 'student_college';

export interface WorkflowTemplate {
  id: string;
  firm_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  workflow_type: string;
  grade_level: GradeLevel | null;
  instantiation_scope: InstantiationScope;
  is_system_template: boolean;
  is_active: boolean;
  is_default: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplateStep {
  id: string;
  workflow_template_id: string;
  name: string;
  description: string | null;
  step_order: number;
  step_type: string;
  task_type: string | null;
  default_assignee_role: string | null;
  default_due_offset_days: number | null;
  depends_on_step_id: string | null;
  is_required: boolean;
  visibility_scope: StepVisibilityScope;
  created_at: string;
  updated_at: string;
}

export interface StudentWorkflow {
  id: string;
  firm_id: string;
  student_id: string;
  workflow_template_id: string | null;
  student_college_id: string | null;
  name: string | null;
  description: string | null;
  status: WorkflowStatus;
  started_at: string | null;
  completed_at: string | null;
  due_date: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentWorkflowStep {
  id: string;
  student_workflow_id: string;
  template_step_id: string;
  title: string | null;
  description: string | null;
  step_order: number | null;
  status: StepStatus;
  assigned_user_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by_user_id: string | null;
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

export type CreateWorkflowTemplateInput = Pick<
  WorkflowTemplate,
  'firm_id' | 'name' | 'workflow_type'
> &
  Partial<
    Pick<
      WorkflowTemplate,
      | 'description'
      | 'category'
      | 'grade_level'
      | 'instantiation_scope'
      | 'is_active'
      | 'is_default'
      | 'created_by_user_id'
    >
  >;

export type UpdateWorkflowTemplateInput = Partial<
  Pick<
    WorkflowTemplate,
    | 'name'
    | 'description'
    | 'category'
    | 'workflow_type'
    | 'grade_level'
    | 'instantiation_scope'
    | 'is_active'
    | 'is_default'
  >
>;

export type CreateWorkflowTemplateStepInput = Pick<
  WorkflowTemplateStep,
  'workflow_template_id' | 'name' | 'step_order' | 'step_type'
> &
  Partial<
    Pick<
      WorkflowTemplateStep,
      | 'description'
      | 'task_type'
      | 'default_assignee_role'
      | 'default_due_offset_days'
      | 'depends_on_step_id'
      | 'is_required'
      | 'visibility_scope'
    >
  >;

export type UpdateWorkflowTemplateStepInput = Partial<
  Omit<CreateWorkflowTemplateStepInput, 'workflow_template_id'>
>;

export type CreateStudentWorkflowInput = Pick<
  StudentWorkflow,
  'firm_id' | 'student_id'
> &
  Partial<
    Pick<
      StudentWorkflow,
      | 'workflow_template_id'
      | 'student_college_id'
      | 'name'
      | 'description'
      | 'due_date'
      | 'created_by_user_id'
    >
  >;

export type UpdateStudentWorkflowStepInput = Partial<
  Pick<
    StudentWorkflowStep,
    | 'title'
    | 'description'
    | 'status'
    | 'assigned_user_id'
    | 'due_date'
    | 'completed_at'
    | 'completed_by_user_id'
    | 'linked_task_id'
    | 'notes'
    | 'step_order'
  >
>;
