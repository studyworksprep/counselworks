import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FirmDashboardStats,
  CounselorDashboardStats,
  StudentDashboardStats,
} from "./types";

export async function getFirmDashboardStats(
  supabase: SupabaseClient,
  firmId: string
): Promise<FirmDashboardStats> {
  const [studentsResult, tasksResult, applicationsResult, meetingsResult] =
    await Promise.all([
      supabase
        .from("students")
        .select("id", { count: "exact" })
        .eq("firm_id", firmId)
        .eq("status", "active")
        .is("archived_at", null),
      supabase
        .from("tasks")
        .select("id", { count: "exact" })
        .eq("firm_id", firmId)
        .eq("status", "pending")
        .lt("due_at", new Date().toISOString())
        .is("archived_at", null),
      supabase
        .from("applications")
        .select("id, stage", { count: "exact" })
        .eq("firm_id", firmId),
      supabase
        .from("meetings")
        .select("id", { count: "exact" })
        .eq("firm_id", firmId)
        .gte("scheduled_start_at", new Date().toISOString()),
    ]);

  return {
    active_students: studentsResult.count ?? 0,
    students_by_counselor: [],
    upcoming_deadlines: 0,
    overdue_tasks: tasksResult.count ?? 0,
    applications_in_progress:
      (applicationsResult.data ?? []).filter(
        (a) => a.stage === "in_progress"
      ).length,
    applications_submitted:
      (applicationsResult.data ?? []).filter(
        (a) => a.stage === "submitted"
      ).length,
    recent_messages: 0,
    upcoming_meetings: meetingsResult.count ?? 0,
  };
}

export async function getCounselorDashboardStats(
  supabase: SupabaseClient,
  firmId: string,
  userId: string
): Promise<CounselorDashboardStats> {
  const [assignmentsResult, tasksResult, meetingsResult] = await Promise.all([
    supabase
      .from("student_staff_assignments")
      .select("student_id", { count: "exact" })
      .eq("firm_id", firmId)
      .eq("user_id", userId),
    supabase
      .from("tasks")
      .select("id, due_at", { count: "exact" })
      .eq("firm_id", firmId)
      .eq("assigned_user_id", userId)
      .in("status", ["pending", "in_progress"])
      .is("archived_at", null),
    supabase
      .from("meetings")
      .select("id", { count: "exact" })
      .eq("firm_id", firmId)
      .gte("scheduled_start_at", new Date().toISOString()),
  ]);

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const tasks = tasksResult.data ?? [];
  const dueToday = tasks.filter(
    (t) => t.due_at && t.due_at.startsWith(today)
  ).length;
  const overdue = tasks.filter(
    (t) => t.due_at && new Date(t.due_at) < now
  ).length;

  return {
    my_students: assignmentsResult.count ?? 0,
    due_today: dueToday,
    overdue,
    pending_essay_reviews: 0,
    upcoming_meetings: meetingsResult.count ?? 0,
    recent_decisions: 0,
  };
}

export async function getStudentDashboardStats(
  supabase: SupabaseClient,
  firmId: string,
  studentId: string
): Promise<StudentDashboardStats> {
  const [tasksResult, collegesResult, essaysResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact" })
      .eq("firm_id", firmId)
      .eq("student_id", studentId)
      .in("status", ["pending", "in_progress"])
      .is("archived_at", null),
    supabase
      .from("student_colleges")
      .select("id", { count: "exact" })
      .eq("firm_id", firmId)
      .eq("student_id", studentId),
    supabase
      .from("essay_drafts")
      .select("id", { count: "exact" })
      .eq("firm_id", firmId)
      .eq("student_id", studentId)
      .in("status", ["draft", "in_review", "revision_requested"]),
  ]);

  return {
    upcoming_deadlines: 0,
    assigned_tasks: tasksResult.count ?? 0,
    college_list_count: collegesResult.count ?? 0,
    essays_in_progress: essaysResult.count ?? 0,
    unread_messages: 0,
  };
}
