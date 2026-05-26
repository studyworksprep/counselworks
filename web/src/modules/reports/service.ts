import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FirmDashboardStats,
  CounselorDashboardStats,
  StudentDashboardStats,
} from "./types";

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function getFirmDashboardStats(
  supabase: SupabaseClient,
  firmId: string,
): Promise<FirmDashboardStats> {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const in30Days = isoDaysFromNow(30);
  const sevenDaysAgo = isoDaysAgo(7);

  const [
    studentsResult,
    overdueTasksResult,
    upcomingTaskDeadlinesResult,
    upcomingAppDeadlinesResult,
    applicationsResult,
    upcomingMeetingsResult,
    recentMessagesResult,
    primaryAssignments,
    activeWorkflowsResult,
    stalledWorkflowsResult,
  ] = await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("status", "active")
      .is("archived_at", null),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .in("status", ["pending", "in_progress"])
      .lt("due_at", now)
      .is("archived_at", null),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .in("status", ["pending", "in_progress"])
      .gte("due_at", now)
      .lte("due_at", in30Days)
      .is("archived_at", null),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .gte("deadline_at", now)
      .lte("deadline_at", in30Days),
    supabase
      .from("applications")
      .select("stage")
      .eq("firm_id", firmId),
    supabase
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .gte("scheduled_start_at", now),
    supabase
      .from("messages")
      .select("id, conversations!inner(firm_id)", {
        count: "exact",
        head: true,
      })
      .eq("conversations.firm_id", firmId)
      .gte("sent_at", sevenDaysAgo),
    supabase
      .from("student_staff_assignments")
      .select("user_id, users:user_id(first_name, last_name)")
      .eq("firm_id", firmId)
      .eq("is_primary", true),
    supabase
      .from("student_workflows")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .in("status", ["not_started", "in_progress"]),
    supabase
      .from("student_workflows")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .in("status", ["not_started", "in_progress"])
      .lt("due_date", today),
  ]);

  // Aggregate primary-counselor caseload
  const counselorCounts = new Map<string, { name: string; count: number }>();
  type UserName = { first_name: string | null; last_name: string | null };
  for (const row of (primaryAssignments.data ?? []) as Array<{
    user_id: string;
    users: UserName | UserName[] | null;
  }>) {
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    if (!user) continue;
    const name =
      `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Unknown";
    const existing = counselorCounts.get(row.user_id);
    if (existing) existing.count++;
    else counselorCounts.set(row.user_id, { name, count: 1 });
  }

  return {
    active_students: studentsResult.count ?? 0,
    students_by_counselor: Array.from(counselorCounts.values())
      .map(({ name, count }) => ({ counselor_name: name, count }))
      .sort((a, b) => b.count - a.count),
    upcoming_deadlines:
      (upcomingTaskDeadlinesResult.count ?? 0) +
      (upcomingAppDeadlinesResult.count ?? 0),
    overdue_tasks: overdueTasksResult.count ?? 0,
    applications_in_progress:
      (applicationsResult.data ?? []).filter((a) => a.stage === "in_progress")
        .length,
    applications_submitted:
      (applicationsResult.data ?? []).filter((a) => a.stage === "submitted")
        .length,
    recent_messages: recentMessagesResult.count ?? 0,
    upcoming_meetings: upcomingMeetingsResult.count ?? 0,
    active_workflows: activeWorkflowsResult.count ?? 0,
    stalled_workflows: stalledWorkflowsResult.count ?? 0,
  };
}

export async function getCounselorDashboardStats(
  supabase: SupabaseClient,
  firmId: string,
  userId: string,
): Promise<CounselorDashboardStats> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const in7Days = isoDaysFromNow(7).slice(0, 10);
  const in30DaysAgo = isoDaysAgo(30);

  // Resolve this counselor's assigned students once for downstream filters.
  const { data: myAssignments } = await supabase
    .from("student_staff_assignments")
    .select("student_id")
    .eq("firm_id", firmId)
    .eq("user_id", userId);
  const studentIds = (myAssignments ?? []).map((a) => a.student_id as string);

  const [
    tasksResult,
    upcomingMeetingsResult,
    pendingEssayReviews,
    recentDecisions,
    workflowStepsDueThisWeek,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, due_at")
      .eq("firm_id", firmId)
      .eq("assigned_user_id", userId)
      .in("status", ["pending", "in_progress"])
      .is("archived_at", null),
    supabase
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .gte("scheduled_start_at", now.toISOString()),
    studentIds.length === 0
      ? Promise.resolve({ count: 0 })
      : supabase
          .from("essay_drafts")
          .select("id", { count: "exact", head: true })
          .eq("firm_id", firmId)
          .in("student_id", studentIds)
          .in("status", ["in_review", "revision_requested"]),
    studentIds.length === 0
      ? Promise.resolve({ count: 0 })
      : supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("firm_id", firmId)
          .in("student_id", studentIds)
          .eq("stage", "decision_received")
          .gte("updated_at", in30DaysAgo),
    supabase
      .from("student_workflow_steps")
      .select("id, student_workflows!inner(firm_id)", {
        count: "exact",
        head: true,
      })
      .eq("assigned_user_id", userId)
      .eq("student_workflows.firm_id", firmId)
      .in("status", ["pending", "in_progress"])
      .gte("due_date", today)
      .lte("due_date", in7Days),
  ]);

  const tasks = tasksResult.data ?? [];
  const dueToday = tasks.filter(
    (t) => t.due_at && t.due_at.startsWith(today),
  ).length;
  const overdue = tasks.filter(
    (t) => t.due_at && new Date(t.due_at) < now,
  ).length;

  return {
    my_students: studentIds.length,
    due_today: dueToday,
    overdue,
    pending_essay_reviews: pendingEssayReviews.count ?? 0,
    upcoming_meetings: upcomingMeetingsResult.count ?? 0,
    recent_decisions: recentDecisions.count ?? 0,
    workflow_steps_due_this_week: workflowStepsDueThisWeek.count ?? 0,
  };
}

export async function getStudentDashboardStats(
  supabase: SupabaseClient,
  firmId: string,
  studentId: string,
  userId: string,
): Promise<StudentDashboardStats> {
  const now = new Date().toISOString();
  const in30Days = isoDaysFromNow(30);

  const [
    tasksResult,
    collegesResult,
    essaysResult,
    upcomingDeadlinesResult,
    conversationsResult,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("student_id", studentId)
      .in("status", ["pending", "in_progress"])
      .is("archived_at", null),
    supabase
      .from("student_colleges")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("student_id", studentId),
    supabase
      .from("essay_drafts")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("student_id", studentId)
      .in("status", ["draft", "in_review", "revision_requested"]),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId)
      .eq("student_id", studentId)
      .gte("deadline_at", now)
      .lte("deadline_at", in30Days),
    supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId),
  ]);

  // Unread messages: messages in this user's conversations, not authored by
  // them, with no matching message_reads row.
  let unreadMessages = 0;
  const conversationIds = (conversationsResult.data ?? [])
    .map((p) => p.conversation_id as string)
    .filter(Boolean);

  if (conversationIds.length > 0) {
    const [{ data: incomingMessages }, { data: reads }] = await Promise.all([
      supabase
        .from("messages")
        .select("id")
        .in("conversation_id", conversationIds)
        .neq("sender_user_id", userId),
      supabase.from("message_reads").select("message_id").eq("user_id", userId),
    ]);
    const readSet = new Set(
      (reads ?? []).map((r) => r.message_id as string),
    );
    unreadMessages = (incomingMessages ?? []).filter(
      (m) => !readSet.has(m.id as string),
    ).length;
  }

  return {
    upcoming_deadlines: upcomingDeadlinesResult.count ?? 0,
    assigned_tasks: tasksResult.count ?? 0,
    college_list_count: collegesResult.count ?? 0,
    essays_in_progress: essaysResult.count ?? 0,
    unread_messages: unreadMessages,
  };
}
