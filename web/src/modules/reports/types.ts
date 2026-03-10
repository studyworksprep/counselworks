export interface FirmDashboardStats {
  active_students: number;
  students_by_counselor: { counselor_name: string; count: number }[];
  upcoming_deadlines: number;
  overdue_tasks: number;
  applications_in_progress: number;
  applications_submitted: number;
  recent_messages: number;
  upcoming_meetings: number;
}

export interface CounselorDashboardStats {
  my_students: number;
  due_today: number;
  overdue: number;
  pending_essay_reviews: number;
  upcoming_meetings: number;
  recent_decisions: number;
}

export interface StudentDashboardStats {
  upcoming_deadlines: number;
  assigned_tasks: number;
  college_list_count: number;
  essays_in_progress: number;
  unread_messages: number;
}

export interface ParentDashboardStats {
  household_students: number;
  upcoming_deadlines: number;
  shared_meetings: number;
  action_items: number;
}

export interface DeadlineReport {
  student_name: string;
  college_name: string;
  deadline: string;
  days_remaining: number;
  application_status: string;
}

export interface CaseloadReport {
  counselor_name: string;
  active_students: number;
  total_applications: number;
  submitted_applications: number;
  overdue_tasks: number;
}

export interface CompletionReport {
  student_name: string;
  total_applications: number;
  submitted: number;
  completion_rate: number;
  essays_completed: number;
  essays_total: number;
}

export interface DecisionOutcomeReport {
  college_name: string;
  accepted: number;
  rejected: number;
  waitlisted: number;
  deferred: number;
  total: number;
}
