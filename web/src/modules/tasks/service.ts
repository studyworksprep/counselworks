import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Task,
  TaskWithAssignee,
  TaskFilters,
  CreateTaskInput,
  UpdateTaskInput,
} from './types';

export async function getTasksByFirm(
  client: SupabaseClient,
  firmId: string,
  filters?: TaskFilters,
): Promise<{ data: TaskWithAssignee[]; error: Error | null }> {
  let query = client
    .from('tasks')
    .select('*, assignee:users!tasks_assigned_to_fkey(id, first_name, last_name, avatar_url), students(id, first_name, last_name)')
    .eq('firm_id', firmId);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.assignee_id) {
    query = query.eq('assigned_to', filters.assignee_id);
  }

  if (filters?.student_id) {
    query = query.eq('student_id', filters.student_id);
  }

  if (filters?.priority) {
    query = query.eq('priority', filters.priority);
  }

  if (filters?.due_date_from) {
    query = query.gte('due_date', filters.due_date_from);
  }

  if (filters?.due_date_to) {
    query = query.lte('due_date', filters.due_date_to);
  }

  const { data, error } = await query.order('due_date', { ascending: true, nullsFirst: false });

  return { data: (data as TaskWithAssignee[]) ?? [], error };
}

export async function getTaskById(
  client: SupabaseClient,
  taskId: string,
): Promise<{ data: TaskWithAssignee | null; error: Error | null }> {
  const { data, error } = await client
    .from('tasks')
    .select('*, assignee:users!tasks_assigned_to_fkey(id, first_name, last_name, avatar_url), students(id, first_name, last_name)')
    .eq('id', taskId)
    .single();

  return { data: data as TaskWithAssignee | null, error };
}

export async function createTask(
  client: SupabaseClient,
  input: CreateTaskInput,
): Promise<{ data: Task | null; error: Error | null }> {
  const { data, error } = await client
    .from('tasks')
    .insert({
      ...input,
      status: 'pending',
      priority: input.priority ?? 'medium',
    })
    .select('*')
    .single();

  return { data: data as Task | null, error };
}

export async function updateTask(
  client: SupabaseClient,
  taskId: string,
  input: UpdateTaskInput,
): Promise<{ data: Task | null; error: Error | null }> {
  const { data, error } = await client
    .from('tasks')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .select('*')
    .single();

  return { data: data as Task | null, error };
}

export async function completeTask(
  client: SupabaseClient,
  taskId: string,
): Promise<{ data: Task | null; error: Error | null }> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('tasks')
    .update({ status: 'completed', completed_at: now, updated_at: now })
    .eq('id', taskId)
    .select('*')
    .single();

  return { data: data as Task | null, error };
}

export async function getOverdueTasks(
  client: SupabaseClient,
  firmId: string,
): Promise<{ data: TaskWithAssignee[]; error: Error | null }> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('tasks')
    .select('*, assignee:users!tasks_assigned_to_fkey(id, first_name, last_name, avatar_url), students(id, first_name, last_name)')
    .eq('firm_id', firmId)
    .in('status', ['pending', 'in_progress'])
    .lt('due_date', now)
    .order('due_date', { ascending: true });

  return { data: (data as TaskWithAssignee[]) ?? [], error };
}

export async function getUpcomingTasks(
  client: SupabaseClient,
  firmId: string,
  days = 7,
): Promise<{ data: TaskWithAssignee[]; error: Error | null }> {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const { data, error } = await client
    .from('tasks')
    .select('*, assignee:users!tasks_assigned_to_fkey(id, first_name, last_name, avatar_url), students(id, first_name, last_name)')
    .eq('firm_id', firmId)
    .in('status', ['pending', 'in_progress'])
    .gte('due_date', now.toISOString())
    .lte('due_date', future.toISOString())
    .order('due_date', { ascending: true });

  return { data: (data as TaskWithAssignee[]) ?? [], error };
}
