export interface Task {
  id: string;
  firm_id: string;
  student_id: string | null;
  assigned_to: string | null;
  created_by: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWithAssignee extends Task {
  assignee: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  } | null;
  students: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

export interface TaskFilters {
  status?: Task['status'];
  assignee_id?: string;
  student_id?: string;
  priority?: Task['priority'];
  due_date_from?: string;
  due_date_to?: string;
}

export type CreateTaskInput = Pick<Task, 'firm_id' | 'title' | 'created_by'> &
  Partial<Pick<Task, 'student_id' | 'assigned_to' | 'description' | 'priority' | 'due_date'>>;

export type UpdateTaskInput = Partial<Omit<Task, 'id' | 'firm_id' | 'created_by' | 'created_at' | 'updated_at'>>;
