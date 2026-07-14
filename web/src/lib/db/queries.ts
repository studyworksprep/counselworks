import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb } from "./client";
import {
  scoreCollegeForProfile,
  classifyAdmissionOdds,
  computeListBalance,
} from "../colleges/recommendation";
import { parseChecklist } from "../constants/applications";
import {
  resolveUserAndFirm,
  getAssignedStudentIds,
  isStaffRole,
  isPlaceholderUser,
  STAFF_ROLE_LIST,
} from "../auth/resolve";
import { resolveStudentRelationship } from "../auth/authorize";

/**
 * Surfaces Supabase errors loudly during development so a missing column or
 * RLS issue doesn't quietly return an empty array (which then looks like a
 * data problem on the page). In production we still log + degrade so the
 * page renders.
 */
function assertNoQueryError(error: unknown, queryName: string): void {
  if (!error) return;
  console.error(`[db:${queryName}]`, error);
  if (process.env.NODE_ENV !== "production") {
    const msg =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
    throw new Error(`Query "${queryName}" failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Upcoming meetings: small role-scoped list for the dashboard sidebar.
// ---------------------------------------------------------------------------
export async function getUpcomingMeetingsForUser(limit = 5) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  const db = getDb();
  let query = db
    .from("meetings")
    .select("id, title, scheduled_start_at, student_id")
    .eq("firm_id", ctx.firmId)
    .gte("scheduled_start_at", new Date().toISOString())
    .order("scheduled_start_at", { ascending: true })
    .limit(limit);
  if (scopedIds !== null) {
    query = query.in("student_id", scopedIds);
  }

  const { data, error } = await query;
  assertNoQueryError(error, "getUpcomingMeetingsForUser");
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Student portal: dashboard data for the logged-in student
// ---------------------------------------------------------------------------

export async function getStudentPortalData() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = getDb();

  // Find the student record linked to this user
  const { data: student } = await db
    .from("students")
    .select("id, first_name, last_name, graduation_year, school_name, status")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId)
    .single();

  if (!student) return null;

  const now = new Date().toISOString();
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);

  const [tasks, overdueTasks, applications, upcomingMeetings] =
    await Promise.all([
      db
        .from("tasks")
        .select("id, title, status, priority, due_at")
        .eq("firm_id", ctx.firmId)
        .eq("student_id", student.id)
        .in("status", ["pending", "in_progress"])
        .in("visibility_scope", ["student", "family", "firm"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(10),
      db
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", ctx.firmId)
        .eq("student_id", student.id)
        .in("status", ["pending", "in_progress"])
        .lt("due_at", now),
      db
        .from("applications")
        .select(
          "id, application_type, stage, deadline_at, college:college_id(name)"
        )
        .eq("firm_id", ctx.firmId)
        .eq("student_id", student.id)
        .order("deadline_at", { ascending: true, nullsFirst: false })
        .limit(20),
      db
        .from("meetings")
        .select(
          "id, title, scheduled_start_at, location_text, meeting_attendees(users:user_id(first_name, last_name))"
        )
        .eq("firm_id", ctx.firmId)
        .eq("student_id", student.id)
        .gte("scheduled_start_at", now)
        .order("scheduled_start_at", { ascending: true })
        .limit(5),
    ]);

  return {
    student,
    tasks: tasks.data ?? [],
    overdueTasks: overdueTasks.count ?? 0,
    applications: applications.data ?? [],
    upcomingMeetings: upcomingMeetings.data ?? [],
  };
}

/**
 * Helper: resolve current user to their linked student record.
 * Returns { ctx, studentId } or null if no student is linked.
 */
async function resolveStudentForPortal() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = getDb();
  const { data: student } = await db
    .from("students")
    .select("id")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId)
    .single();

  if (!student) return null;
  return { ctx, studentId: student.id, db };
}

export async function getStudentTasks(filters?: {
  status?: string;
}) {
  const resolved = await resolveStudentForPortal();
  if (!resolved) return [];

  const { ctx, studentId, db } = resolved;
  let query = db
    .from("tasks")
    .select(
      `id, title, description, task_type, status, priority, visibility_scope,
       due_at, completed_at, created_at`
    )
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .in("visibility_scope", ["student", "family", "firm"])
    .is("archived_at", null)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to fetch student tasks:", error);
    return [];
  }
  return data ?? [];
}

export async function getStudentApplications() {
  const resolved = await resolveStudentForPortal();
  if (!resolved) return [];

  const { ctx, studentId, db } = resolved;
  const { data, error } = await db
    .from("applications")
    .select(
      `id, stage, application_type, deadline_at, submitted_at, decision_result,
       colleges(id, name)`
    )
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .order("deadline_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Failed to fetch student applications:", error);
    return [];
  }

  return (data ?? []).map((a) => {
    const college = (a as Record<string, unknown>).colleges as
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null;
    return {
      ...a,
      college_name: college
        ? Array.isArray(college)
          ? college[0]?.name ?? "Unknown"
          : college.name
        : "Unknown",
    };
  });
}

export async function getStudentEssays() {
  const resolved = await resolveStudentForPortal();
  if (!resolved) return [];

  const { ctx, studentId, db } = resolved;
  const { data, error } = await db
    .from("essay_drafts")
    .select(
      `id, title, essay_type, status, prompt_text, body, word_count_target,
       word_count_limit, current_version_number, visibility_scope, created_at,
       updated_at`
    )
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .in("visibility_scope", ["student", "family", "firm"])
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch student essays:", error);
    return [];
  }
  return data ?? [];
}

export async function getStudentDocuments() {
  const resolved = await resolveStudentForPortal();
  if (!resolved) return [];

  const { ctx, studentId, db } = resolved;
  const { data, error } = await db
    .from("documents")
    .select(
      `id, title, category, mime_type, file_size_bytes, storage_key,
       visibility_scope, created_at,
       uploader:uploaded_by_user_id(first_name, last_name)`
    )
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .in("visibility_scope", ["student", "family", "firm"])
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch student documents:", error);
    return [];
  }
  return data ?? [];
}

export async function getStudentConversations() {
  const resolved = await resolveStudentForPortal();
  if (!resolved) return [];

  const { ctx, db } = resolved;
  // Participant-scoped: portal users only see conversations they are in.
  const { data, error } = await db
    .from("conversations")
    .select(
      `id, conversation_type, visibility_scope, created_at, updated_at,
       my_participation:conversation_participants!inner(user_id),
       conversation_participants(
         user_id,
         users:user_id(first_name, last_name)
       ),
       messages(id, body, sent_at, sender_user_id,
         message_reads(user_id),
         sender:sender_user_id(first_name, last_name)
       )`
    )
    .eq("firm_id", ctx.firmId)
    .eq("my_participation.user_id", ctx.dbUserId)
    .in("visibility_scope", ["student", "family", "firm"])
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch student conversations:", error);
    return [];
  }

  return (data ?? []).map((c) => {
    const participants = (
      (c as Record<string, unknown>).conversation_participants as Array<{
        user_id: string;
        users: { first_name: string; last_name: string };
      }>
    ) ?? [];
    const messages = (
      (c as Record<string, unknown>).messages as Array<{
        id: string;
        body: string;
        sent_at: string;
        sender_user_id: string;
        message_reads: Array<{ user_id: string }> | null;
        sender: { first_name: string; last_name: string };
      }>
    ) ?? [];

    const lastMessage = messages.length > 0
      ? messages.reduce((latest, m) =>
          m.sent_at > latest.sent_at ? m : latest
        )
      : null;
    const unreadCount = messages.filter(
      (m) =>
        m.sender_user_id !== ctx.dbUserId &&
        !(m.message_reads ?? []).some((r) => r.user_id === ctx.dbUserId)
    ).length;

    return {
      id: c.id,
      conversation_type: c.conversation_type,
      updated_at: c.updated_at,
      participants: participants.map((p) => ({
        userId: p.user_id,
        name: `${p.users.first_name} ${p.users.last_name}`,
      })),
      lastMessage: lastMessage
        ? {
            body: lastMessage.body,
            senderName: `${lastMessage.sender.first_name}`,
            sentAt: lastMessage.sent_at,
          }
        : null,
      messageCount: messages.length,
      unreadCount,
    };
  });
}

// ---------------------------------------------------------------------------
// Family (parent) portal queries
// ---------------------------------------------------------------------------

async function resolveParentForPortal() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = getDb();

  const { data: membership } = await db
    .from("family_members")
    .select("family_id")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId)
    .limit(1)
    .single();

  if (!membership) return null;

  const { data: students } = await db
    .from("students")
    .select("id, first_name, last_name, graduation_year, school_name, status")
    .eq("firm_id", ctx.firmId)
    .eq("family_id", membership.family_id)
    .eq("status", "active")
    .order("graduation_year", { ascending: true });

  const studentList = students ?? [];
  return {
    ctx,
    familyId: membership.family_id,
    students: studentList,
    studentIds: studentList.map((s) => s.id),
    db,
  };
}

export async function getParentDashboardData() {
  const resolved = await resolveParentForPortal();
  if (!resolved) return null;

  const { ctx, students, studentIds, db } = resolved;
  if (studentIds.length === 0) {
    return { students, tasks: [], overdueTasks: 0, applications: [], upcomingMeetings: [] };
  }

  const now = new Date().toISOString();

  const [tasks, overdueTasks, applications, upcomingMeetings] =
    await Promise.all([
      db
        .from("tasks")
        .select("id, title, status, priority, due_at, student_id, students(first_name)")
        .eq("firm_id", ctx.firmId)
        .in("student_id", studentIds)
        .in("status", ["pending", "in_progress"])
        .in("visibility_scope", ["family", "firm"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(15),
      db
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", ctx.firmId)
        .in("student_id", studentIds)
        .in("status", ["pending", "in_progress"])
        .lt("due_at", now),
      db
        .from("applications")
        .select(
          "id, application_type, stage, deadline_at, submitted_at, decision_result, student_id, students(first_name), college:college_id(name)"
        )
        .eq("firm_id", ctx.firmId)
        .in("student_id", studentIds)
        .order("deadline_at", { ascending: true, nullsFirst: false }),
      db
        .from("meetings")
        .select(
          "id, title, scheduled_start_at, location_text, student_id, students(first_name), meeting_attendees(users:user_id(first_name, last_name))"
        )
        .eq("firm_id", ctx.firmId)
        .in("student_id", studentIds)
        .gte("scheduled_start_at", now)
        .order("scheduled_start_at", { ascending: true })
        .limit(5),
    ]);

  return {
    students,
    tasks: tasks.data ?? [],
    overdueTasks: overdueTasks.count ?? 0,
    applications: applications.data ?? [],
    upcomingMeetings: upcomingMeetings.data ?? [],
  };
}

export async function getParentTasks() {
  const resolved = await resolveParentForPortal();
  if (!resolved) return [];

  const { ctx, studentIds, db } = resolved;
  if (studentIds.length === 0) return [];

  const { data, error } = await db
    .from("tasks")
    .select(
      `id, title, description, task_type, status, priority, due_at, completed_at,
       student_id, students(first_name, last_name)`
    )
    .eq("firm_id", ctx.firmId)
    .in("student_id", studentIds)
    .in("visibility_scope", ["family", "firm"])
    .is("archived_at", null)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Failed to fetch parent tasks:", error);
    return [];
  }
  return data ?? [];
}

export async function getParentApplications() {
  const resolved = await resolveParentForPortal();
  if (!resolved) return [];

  const { ctx, studentIds, db } = resolved;
  if (studentIds.length === 0) return [];

  const { data, error } = await db
    .from("applications")
    .select(
      `id, stage, application_type, deadline_at, submitted_at, decision_result,
       student_id, students(first_name, last_name),
       colleges(id, name)`
    )
    .eq("firm_id", ctx.firmId)
    .in("student_id", studentIds)
    .order("deadline_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Failed to fetch parent applications:", error);
    return [];
  }

  return (data ?? []).map((a) => {
    const student = (a as Record<string, unknown>).students as
      | { first_name: string; last_name: string }
      | { first_name: string; last_name: string }[]
      | null;
    const college = (a as Record<string, unknown>).colleges as
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null;
    return {
      ...a,
      student_name: student
        ? Array.isArray(student)
          ? `${student[0]?.first_name} ${student[0]?.last_name}`
          : `${student.first_name} ${student.last_name}`
        : "Unknown",
      college_name: college
        ? Array.isArray(college)
          ? college[0]?.name ?? "Unknown"
          : college.name
        : "Unknown",
    };
  });
}

export async function getParentDocuments() {
  const resolved = await resolveParentForPortal();
  if (!resolved) return [];

  const { ctx, familyId, studentIds, db } = resolved;

  let query = db
    .from("documents")
    .select(
      `id, title, category, mime_type, file_size_bytes, storage_key,
       visibility_scope, created_at, student_id,
       students(first_name, last_name),
       uploader:uploaded_by_user_id(first_name, last_name)`
    )
    .eq("firm_id", ctx.firmId)
    .in("visibility_scope", ["family", "firm"])
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (studentIds.length > 0) {
    query = query.or(
      `family_id.eq.${familyId},student_id.in.(${studentIds.join(",")})`
    );
  } else {
    query = query.eq("family_id", familyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to fetch parent documents:", error);
    return [];
  }
  return data ?? [];
}

export async function getParentConversations() {
  const resolved = await resolveParentForPortal();
  if (!resolved) return [];

  const { ctx, db } = resolved;

  // Participant-scoped: portal users only see conversations they are in.
  const { data, error } = await db
    .from("conversations")
    .select(
      `id, conversation_type, visibility_scope, created_at, updated_at,
       student_id, students(first_name),
       my_participation:conversation_participants!inner(user_id),
       conversation_participants(
         user_id,
         users:user_id(first_name, last_name)
       ),
       messages(id, body, sent_at, sender_user_id,
         message_reads(user_id),
         sender:sender_user_id(first_name, last_name)
       )`
    )
    .eq("firm_id", ctx.firmId)
    .eq("my_participation.user_id", ctx.dbUserId)
    .in("visibility_scope", ["family", "firm"])
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("Failed to fetch parent conversations:", error);
    return [];
  }

  return (data ?? []).map((c) => {
    const participants = (
      (c as Record<string, unknown>).conversation_participants as Array<{
        user_id: string;
        users: { first_name: string; last_name: string };
      }>
    ) ?? [];
    const messages = (
      (c as Record<string, unknown>).messages as Array<{
        id: string;
        body: string;
        sent_at: string;
        sender_user_id: string;
        message_reads: Array<{ user_id: string }> | null;
        sender: { first_name: string; last_name: string };
      }>
    ) ?? [];

    const lastMessage = messages.length > 0
      ? messages.reduce((latest, m) =>
          m.sent_at > latest.sent_at ? m : latest
        )
      : null;
    const unreadCount = messages.filter(
      (m) =>
        m.sender_user_id !== ctx.dbUserId &&
        !(m.message_reads ?? []).some((r) => r.user_id === ctx.dbUserId)
    ).length;

    return {
      id: c.id,
      conversation_type: c.conversation_type,
      updated_at: c.updated_at,
      participants: participants.map((p) => ({
        userId: p.user_id,
        name: `${p.users.first_name} ${p.users.last_name}`,
      })),
      lastMessage: lastMessage
        ? {
            body: lastMessage.body,
            senderName: `${lastMessage.sender.first_name}`,
            sentAt: lastMessage.sent_at,
          }
        : null,
      messageCount: messages.length,
      unreadCount,
    };
  });
}

// ---------------------------------------------------------------------------
// Student portal: college list
// ---------------------------------------------------------------------------

export async function getStudentCollegeList() {
  const resolved = await resolveStudentForPortal();
  if (!resolved) return [];

  const { ctx, studentId, db } = resolved;
  const { data, error } = await db
    .from("student_colleges")
    .select(
      `id, category, round_type, intended_major, status,
       interview_status, interview_at, engagement_log_json,
       colleges(id, name, slug, acceptance_rate, sat_avg, act_avg,
                undergraduate_size, tuition_in_state, tuition_out_state,
                net_price_avg, graduation_rate, retention_rate,
                earnings_median_10yr, institution_type, locale_type,
                usnews_national_rank, usnews_liberal_arts_rank)`
    )
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch student college list:", error);
    return [];
  }
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Student portal: profile (test scores, activities, awards)
// ---------------------------------------------------------------------------

export async function getStudentProfile() {
  const resolved = await resolveStudentForPortal();
  if (!resolved) return null;

  const { ctx, studentId, db } = resolved;

  const [student, profile] = await Promise.all([
    db
      .from("students")
      .select(
        "id, first_name, last_name, graduation_year, school_name, school_type, gpa_unweighted, gpa_weighted, class_rank, intended_majors_json, academic_interests, extracurricular_summary"
      )
      .eq("id", studentId)
      .eq("firm_id", ctx.firmId)
      .single(),
    db
      .from("student_profiles")
      // Explicit list: counselor-private fields (strategy notes, ratings,
      // risk flags) must never reach the portal.
      .select(
        "testing_summary_json, awards_json, activities_json, budget_range, financial_aid_interest, sat_score, act_score, geographic_preferences, target_school_type, financial_aid_needed, intake_submitted_at"
      )
      .eq("student_id", studentId)
      .single(),
  ]);

  if (!student.data) return null;

  return {
    ...student.data,
    profile: profile.data ?? null,
  };
}

// ---------------------------------------------------------------------------
// Parent portal: college lists for all children
// ---------------------------------------------------------------------------

export async function getParentCollegeLists() {
  const resolved = await resolveParentForPortal();
  if (!resolved) return { students: [], colleges: [] };

  const { ctx, students, studentIds, db } = resolved;
  if (studentIds.length === 0) return { students, colleges: [] };

  const { data, error } = await db
    .from("student_colleges")
    .select(
      `id, category, round_type, intended_major, status, student_id,
       students(first_name, last_name),
       colleges(id, name, slug, acceptance_rate, sat_avg,
                tuition_out_state, net_price_avg, graduation_rate,
                usnews_national_rank)`
    )
    .eq("firm_id", ctx.firmId)
    .in("student_id", studentIds)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to fetch parent college lists:", error);
    return { students, colleges: [] };
  }
  return { students, colleges: data ?? [] };
}

// ---------------------------------------------------------------------------
// Recent activity (audit_events)
// ---------------------------------------------------------------------------
export async function getRecentActivity() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = getDb();
  const { data } = await db
    .from("audit_events")
    .select("id, entity_type, entity_id, action_type, metadata_json, created_at")
    .eq("firm_id", ctx.firmId)
    .order("created_at", { ascending: false })
    .limit(10);

  return data ?? [];
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Server-side pagination (fix plan 11.1)
// ---------------------------------------------------------------------------
// Roster lists (students / families / documents) fetch one page from the DB
// with an exact count and a server-side sort, instead of pulling the whole
// firm and slicing in the browser. `DataTable` renders the page as-is and
// drives page/sort through URL params.

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const LIST_PAGE_SIZE = 25;

export interface ListSort {
  key: string;
  dir: "asc" | "desc";
}

/** Clamp an incoming page to a positive integer. */
function resolvePage(page?: number): number {
  return page && Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

/** Inclusive [from, to] row bounds for a 1-based page. */
function pageBounds(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

const EMPTY_PAGE = <T,>(page: number): Paginated<T> => ({
  rows: [],
  total: 0,
  page,
  pageSize: LIST_PAGE_SIZE,
});

export async function getStudents(filters?: {
  search?: string;
  status?: string;
  graduationYear?: string;
  page?: number;
  sort?: ListSort;
}): Promise<Paginated<{
  id: string;
  first_name: string;
  last_name: string;
  graduation_year: number;
  school_name: string | null;
  status: string;
  counselor_name: string | null;
}>> {
  const page = resolvePage(filters?.page);
  const ctx = await resolveUserAndFirm();
  if (!ctx) return EMPTY_PAGE(page);

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return EMPTY_PAGE(page);

  const db = getDb();
  const { from, to } = pageBounds(page, LIST_PAGE_SIZE);
  const asc = filters?.sort?.dir !== "desc";

  let query = db
    .from("students")
    .select(
      `id, first_name, last_name, graduation_year, school_name, status,
       student_staff_assignments(user_id, assignment_type, is_primary,
         users:user_id(first_name, last_name)
       )`,
      { count: "exact" }
    )
    .eq("firm_id", ctx.firmId);

  // Server-side sort — only over real DB columns. counselor_name is a derived
  // join field and is intentionally not sortable.
  if (filters?.sort?.key === "graduation_year") {
    query = query.order("graduation_year", { ascending: asc });
  } else if (filters?.sort?.key === "status") {
    query = query.order("status", { ascending: asc });
  } else {
    query = query
      .order("last_name", { ascending: asc })
      .order("first_name", { ascending: asc });
  }

  // Archived students leave the roster but stay reachable through the
  // Archived filter (fix plan 7.5) — that's also how they get restored.
  if (filters?.status === "archived") {
    query = query.not("archived_at", "is", null);
  } else {
    query = query.is("archived_at", null);
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
  }

  if (scopedIds !== null) {
    query = query.in("id", scopedIds);
  }
  if (filters?.graduationYear) {
    query = query.eq("graduation_year", parseInt(filters.graduationYear));
  }
  if (filters?.search) {
    query = query.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%`
    );
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error("Failed to fetch students:", error);
    return EMPTY_PAGE(page);
  }

  const rows = (data ?? []).map((s) => {
    const assignments = (s as Record<string, unknown>)
      .student_staff_assignments as
      | Array<{
          is_primary: boolean;
          users: { first_name: string; last_name: string };
        }>
      | undefined;
    const primary = assignments?.find((a) => a.is_primary);
    const counselor = primary?.users ?? assignments?.[0]?.users;
    return {
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      graduation_year: s.graduation_year,
      school_name: s.school_name,
      status: s.status,
      counselor_name: counselor
        ? `${counselor.first_name} ${counselor.last_name}`
        : null,
    };
  });

  return { rows, total: count ?? rows.length, page, pageSize: LIST_PAGE_SIZE };
}

export async function getStudentById(id: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = getDb();
  const { data: student } = await db
    .from("students")
    .select(
      `*,
       student_profiles(*),
       families(household_name)`
    )
    .eq("id", id)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!student) return null;

  // Fetch related counts in parallel
  const [tasks, applications, notes, staff] = await Promise.all([
    db
      .from("tasks")
      .select("id, title, status, due_at, priority")
      .eq("firm_id", ctx.firmId)
      .eq("student_id", id)
      .in("status", ["pending", "in_progress"])
      .order("due_at", { ascending: true })
      .limit(5),
    db
      .from("applications")
      .select("id, stage, deadline_at, college_id, colleges(name)")
      .eq("firm_id", ctx.firmId)
      .eq("student_id", id)
      .order("deadline_at", { ascending: true }),
    db
      .from("notes")
      .select("id, title, body, created_at, note_type, visibility_scope")
      .is("archived_at", null)
      .eq("firm_id", ctx.firmId)
      .eq("student_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("student_staff_assignments")
      .select("id, assignment_type, is_primary, users:user_id(first_name, last_name)")
      .eq("firm_id", ctx.firmId)
      .eq("student_id", id),
  ]);

  return {
    ...student,
    upcomingTasks: tasks.data ?? [],
    applications: applications.data ?? [],
    recentNotes: notes.data ?? [],
    staffAssignments: staff.data ?? [],
  };
}

export async function getCollegeListExportData(studentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  // Scoped staff may only export their assigned students' lists.
  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && !scopedIds.includes(studentId)) return null;

  const db = getDb();
  const [studentRes, firmRes, settingsRes, collegesRes, staffRes, generatorRes] =
    await Promise.all([
      db
        .from("students")
        .select(
          "id, first_name, last_name, graduation_year, school_name, school_type"
        )
        .eq("id", studentId)
        .eq("firm_id", ctx.firmId)
        .single(),
      db.from("firms").select("name").eq("id", ctx.firmId).single(),
      db
        .from("firm_settings")
        .select("branding_logo_url, primary_color")
        .eq("firm_id", ctx.firmId)
        .single(),
      db
        .from("student_colleges")
        .select(
          `id, category, round_type, intended_major, status, notes, sort_order,
           colleges(id, name, city, state_region, acceptance_rate,
                    institution_type),
           applications(id, stage, application_type, deadline_at)`
        )
        .eq("firm_id", ctx.firmId)
        .eq("student_id", studentId)
        .order("sort_order", { ascending: true }),
      db
        .from("student_staff_assignments")
        .select(
          "assignment_type, is_primary, users:user_id(first_name, last_name, email)"
        )
        .eq("firm_id", ctx.firmId)
        .eq("student_id", studentId),
      db
        .from("users")
        .select("first_name, last_name, email")
        .eq("id", ctx.dbUserId)
        .single(),
    ]);

  if (!studentRes.data || !firmRes.data) return null;

  const colleges = (collegesRes.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const apps = r.applications as
      | Array<{
          id: string;
          stage: string;
          application_type: string;
          deadline_at: string | null;
        }>
      | undefined;
    const college = r.colleges as
      | {
          id: string;
          name: string;
          city: string | null;
          state_region: string | null;
          acceptance_rate: number | null;
          institution_type: string | null;
        }
      | Array<{
          id: string;
          name: string;
          city: string | null;
          state_region: string | null;
          acceptance_rate: number | null;
          institution_type: string | null;
        }>
      | null;
    return {
      id: r.id as string,
      category: r.category as string,
      round_type: (r.round_type as string | null) ?? null,
      intended_major: (r.intended_major as string | null) ?? null,
      status: r.status as string,
      notes: (r.notes as string | null) ?? null,
      sort_order: r.sort_order as number,
      college: Array.isArray(college) ? college[0] ?? null : college,
      application: Array.isArray(apps) && apps.length > 0 ? apps[0] : null,
    };
  });

  const assignments = (staffRes.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const u = r.users as
      | { first_name: string; last_name: string; email: string }
      | Array<{ first_name: string; last_name: string; email: string }>
      | null;
    const user = Array.isArray(u) ? u[0] ?? null : u;
    return {
      assignment_type: r.assignment_type as string,
      is_primary: r.is_primary as boolean,
      user,
    };
  });

  return {
    firm: {
      name: firmRes.data.name as string,
      logo_url: settingsRes.data?.branding_logo_url ?? null,
      primary_color: settingsRes.data?.primary_color ?? null,
    },
    student: studentRes.data,
    colleges,
    assignments,
    generatedBy: generatorRes.data,
    generatedAt: new Date().toISOString(),
  };
}

export async function getStudentInvitation(studentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = getDb();
  const { data } = await db
    .from("student_invitations")
    .select("id, email, status, sent_at, accepted_at")
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .in("status", ["pending", "accepted"])
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------
export async function getApplications(filters?: {
  search?: string;
  stage?: string;
  studentId?: string;
  round?: string;
  due?: string; // "soon" (30 days) | "overdue"
}) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  const db = getDb();
  let query = db
    .from("applications")
    .select(
      `id, stage, application_type, deadline_at, submitted_at, decision_result,
       checklist_json,
       students(id, first_name, last_name),
       colleges(id, name, slug)`
    )
    .eq("firm_id", ctx.firmId)
    .order("deadline_at", { ascending: true, nullsFirst: false });

  if (scopedIds !== null) {
    query = query.in("student_id", scopedIds);
  }
  if (filters?.stage) {
    query = query.eq("stage", filters.stage);
  }
  if (filters?.studentId) {
    query = query.eq("student_id", filters.studentId);
  }
  if (filters?.round) {
    query = query.eq("application_type", filters.round);
  }
  // Due-soon / overdue views (fix plan 8.6): only apps still in play.
  if (filters?.due === "soon") {
    const in30Days = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    query = query
      .gte("deadline_at", new Date().toISOString())
      .lte("deadline_at", in30Days.toISOString())
      .in("stage", ["not_started", "in_progress"]);
  } else if (filters?.due === "overdue") {
    query = query
      .lt("deadline_at", new Date().toISOString())
      .in("stage", ["not_started", "in_progress"]);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch applications:", error);
    return [];
  }

  let results = (data ?? []).map((a) => {
    const student = (a as Record<string, unknown>).students as
      | { id: string; first_name: string; last_name: string }
      | undefined;
    const college = (a as Record<string, unknown>).colleges as
      | { id: string; name: string; slug: string }
      | undefined;
    const checklist = parseChecklist(
      (a as Record<string, unknown>).checklist_json
    );
    return {
      id: a.id,
      stage: a.stage,
      application_type: a.application_type,
      deadline_at: a.deadline_at,
      submitted_at: a.submitted_at,
      decision_result: a.decision_result,
      checklist_done: (checklist ?? []).filter((c) => c.done).length,
      checklist_total: (checklist ?? []).length,
      student_id: student?.id ?? "",
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown",
      college_id: college?.id ?? "",
      college_name: college?.name ?? "Unknown",
    };
  });

  if (filters?.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (a) =>
        a.student_name.toLowerCase().includes(term) ||
        a.college_name.toLowerCase().includes(term)
    );
  }

  return results;
}

export async function getStudentsForSelect() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  const db = getDb();
  let query = db
    .from("students")
    .select("id, first_name, last_name")
    .eq("firm_id", ctx.firmId)
    .eq("status", "active")
    .is("archived_at", null)
    .order("last_name", { ascending: true });
  if (scopedIds !== null) {
    query = query.in("id", scopedIds);
  }
  const { data } = await query;

  return (data ?? []).map((s) => ({
    id: s.id,
    name: `${s.first_name} ${s.last_name}`,
  }));
}

export async function getCollegesForSelect() {
  const db = getDb();
  const { data } = await db
    .from("colleges")
    .select("id, name")
    .order("name", { ascending: true });

  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

// ---------------------------------------------------------------------------
// Staff: student college list (per-student view)
// ---------------------------------------------------------------------------
export async function getStudentColleges(studentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = getDb();
  const { data, error } = await db
    .from("student_colleges")
    .select(
      `id, category, round_type, intended_major, status, interest_level,
       counselor_fit_rating, notes, sort_order,
       interview_status, interview_at, engagement_log_json,
       colleges(id, name, slug, city, state_region, website_url,
                acceptance_rate, sat_avg, act_avg,
                undergraduate_size, tuition_in_state, tuition_out_state,
                net_price_avg, graduation_rate, retention_rate,
                earnings_median_10yr, median_debt, federal_loan_rate,
                institution_type, locale_type, scorecard_synced_at,
                usnews_national_rank, usnews_liberal_arts_rank, usnews_business_rank),
       applications(id, stage, application_type, deadline_at, submitted_at, decision_result)`
    )
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    assertNoQueryError(error, "getStudentColleges");
    return [];
  }
  // Flatten the to-many `applications` relation into a single row when
  // present (every student_college has at most one application in our model).
  return (data ?? []).map((sc) => {
    const apps = (sc as Record<string, unknown>).applications as
      | Array<{
          id: string;
          stage: string;
          application_type: string;
          deadline_at: string | null;
          submitted_at: string | null;
          decision_result: string | null;
        }>
      | undefined;
    const application = Array.isArray(apps) && apps.length > 0 ? apps[0] : null;
    return { ...(sc as Record<string, unknown>), application };
  });
}

// ---------------------------------------------------------------------------
// College Planning (student_colleges + scorecard data)
// ---------------------------------------------------------------------------
export async function getCollegePlanningList(filters?: {
  search?: string;
  category?: string;
}) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  const db = getDb();
  let query = db
    .from("student_colleges")
    .select(
      `id, category, round_type, intended_major, status, interest_level, sort_order,
       students(id, first_name, last_name),
       colleges(id, name, slug, acceptance_rate, sat_avg, act_avg,
                undergraduate_size, tuition_in_state, tuition_out_state,
                net_price_avg, graduation_rate, retention_rate,
                earnings_median_10yr, median_debt, federal_loan_rate,
                institution_type, locale_type, scorecard_synced_at,
                usnews_national_rank, usnews_liberal_arts_rank, usnews_business_rank)`
    )
    .eq("firm_id", ctx.firmId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (scopedIds !== null) {
    query = query.in("student_id", scopedIds);
  }
  if (filters?.category) {
    query = query.eq("category", filters.category);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch college planning list:", error);
    return [];
  }

  let results = (data ?? []).map((sc) => {
    const student = (sc as Record<string, unknown>).students as
      | { id: string; first_name: string; last_name: string }
      | undefined;
    const college = (sc as Record<string, unknown>).colleges as
      | {
          id: string;
          name: string;
          slug: string;
          acceptance_rate: number | null;
          sat_avg: number | null;
          act_avg: number | null;
          undergraduate_size: number | null;
          tuition_in_state: number | null;
          tuition_out_state: number | null;
          net_price_avg: number | null;
          graduation_rate: number | null;
          retention_rate: number | null;
          earnings_median_10yr: number | null;
          median_debt: number | null;
          federal_loan_rate: number | null;
          institution_type: string | null;
          locale_type: string | null;
          scorecard_synced_at: string | null;
          usnews_national_rank: number | null;
          usnews_liberal_arts_rank: number | null;
          usnews_business_rank: number | null;
        }
      | undefined;
    return {
      id: sc.id,
      category: sc.category,
      round_type: sc.round_type,
      intended_major: sc.intended_major,
      status: sc.status,
      interest_level: sc.interest_level,
      sort_order: (sc as Record<string, unknown>).sort_order as number,
      student_id: student?.id ?? "",
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown",
      college_id: college?.id ?? "",
      college_name: college?.name ?? "Unknown",
      college_slug: college?.slug ?? "",
      acceptance_rate: college?.acceptance_rate ?? null,
      sat_avg: college?.sat_avg ?? null,
      act_avg: college?.act_avg ?? null,
      undergraduate_size: college?.undergraduate_size ?? null,
      tuition_in_state: college?.tuition_in_state ?? null,
      tuition_out_state: college?.tuition_out_state ?? null,
      net_price_avg: college?.net_price_avg ?? null,
      graduation_rate: college?.graduation_rate ?? null,
      retention_rate: college?.retention_rate ?? null,
      earnings_median_10yr: college?.earnings_median_10yr ?? null,
      median_debt: college?.median_debt ?? null,
      federal_loan_rate: college?.federal_loan_rate ?? null,
      institution_type: college?.institution_type ?? null,
      locale_type: college?.locale_type ?? null,
      usnews_national_rank: college?.usnews_national_rank ?? null,
      usnews_liberal_arts_rank: college?.usnews_liberal_arts_rank ?? null,
      usnews_business_rank: college?.usnews_business_rank ?? null,
      has_scorecard: !!college?.scorecard_synced_at,
    };
  });

  if (filters?.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (r) =>
        r.student_name.toLowerCase().includes(term) ||
        r.college_name.toLowerCase().includes(term)
    );
  }

  return results;
}

export async function getCollegeDetail(collegeId: string) {
  const db = getDb();
  const { data } = await db
    .from("colleges")
    .select("*")
    .eq("id", collegeId)
    .single();

  return data;
}

// ---------------------------------------------------------------------------
// College Discovery & Search
// ---------------------------------------------------------------------------
export interface CollegeDiscoveryFilters {
  search?: string;
  state?: string;
  institution_type?: string;
  locale_type?: string;
  acceptance_rate_min?: number;
  acceptance_rate_max?: number;
  sat_min?: number;
  sat_max?: number;
  act_min?: number;
  act_max?: number;
  tuition_max?: number;
  enrollment_min?: number;
  enrollment_max?: number;
  graduation_rate_min?: number;
  usnews_rank_max?: number;
}

export async function discoverColleges(filters?: CollegeDiscoveryFilters) {
  const db = getDb();

  let query = db
    .from("colleges")
    .select("*")
    .order("name", { ascending: true });

  if (filters?.search) {
    query = query.ilike("name", `%${filters.search}%`);
  }
  if (filters?.state) {
    query = query.eq("state_region", filters.state);
  }
  if (filters?.institution_type) {
    query = query.eq("institution_type", filters.institution_type);
  }
  if (filters?.locale_type) {
    query = query.eq("locale_type", filters.locale_type);
  }
  if (filters?.acceptance_rate_min != null) {
    query = query.gte("acceptance_rate", filters.acceptance_rate_min);
  }
  if (filters?.acceptance_rate_max != null) {
    query = query.lte("acceptance_rate", filters.acceptance_rate_max);
  }
  if (filters?.sat_min != null) {
    query = query.gte("sat_avg", filters.sat_min);
  }
  if (filters?.sat_max != null) {
    query = query.lte("sat_avg", filters.sat_max);
  }
  if (filters?.act_min != null) {
    query = query.gte("act_avg", filters.act_min);
  }
  if (filters?.act_max != null) {
    query = query.lte("act_avg", filters.act_max);
  }
  if (filters?.tuition_max != null) {
    query = query.lte("tuition_out_state", filters.tuition_max);
  }
  if (filters?.enrollment_min != null) {
    query = query.gte("undergraduate_size", filters.enrollment_min);
  }
  if (filters?.enrollment_max != null) {
    query = query.lte("undergraduate_size", filters.enrollment_max);
  }
  if (filters?.graduation_rate_min != null) {
    query = query.gte("graduation_rate", filters.graduation_rate_min);
  }
  if (filters?.usnews_rank_max != null) {
    query = query.or(
      `usnews_national_rank.lte.${filters.usnews_rank_max},usnews_liberal_arts_rank.lte.${filters.usnews_rank_max}`
    );
  }

  const { data, error } = await query.limit(200);

  if (error) {
    console.error("Failed to discover colleges:", error);
    return [];
  }

  return data ?? [];
}

export async function getCollegeStates() {
  const db = getDb();
  const { data } = await db
    .from("colleges")
    .select("state_region")
    .not("state_region", "is", null)
    .order("state_region", { ascending: true });

  const unique = [...new Set((data ?? []).map((r) => r.state_region as string))];
  return unique;
}

// ---------------------------------------------------------------------------
// College Comparison
// ---------------------------------------------------------------------------
export async function getCollegesForComparison(collegeIds: string[]) {
  if (collegeIds.length === 0) return [];

  const db = getDb();
  const { data } = await db
    .from("colleges")
    .select("*")
    .in("id", collegeIds);

  return data ?? [];
}

// ---------------------------------------------------------------------------
// College Recommendations
// ---------------------------------------------------------------------------
export async function getCollegeRecommendations(studentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { student: null, recommendations: [] };

  const db = getDb();

  // Get student + profile
  const { data: student } = await db
    .from("students")
    .select("*, student_profiles(*)")
    .eq("id", studentId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!student) return { student: null, recommendations: [] };

  const profile = Array.isArray(student.student_profiles)
    ? student.student_profiles[0]
    : student.student_profiles;

  // Get colleges already on this student's list
  const { data: existing } = await db
    .from("student_colleges")
    .select("college_id")
    .eq("student_id", studentId)
    .eq("firm_id", ctx.firmId);

  const existingIds = new Set((existing ?? []).map((e) => e.college_id));

  // Fetch all colleges with scorecard data
  const { data: allColleges } = await db
    .from("colleges")
    .select("*")
    .not("scorecard_synced_at", "is", null)
    .order("name", { ascending: true });

  if (!allColleges) return { student, recommendations: [] };

  // Score each college against the profile (pure logic in
  // src/lib/colleges/recommendation.ts, unit-tested).
  const scored = allColleges
    .filter((c) => !existingIds.has(c.id))
    .map((college) => ({
      ...college,
      ...scoreCollegeForProfile(profile, college),
      odds: classifyAdmissionOdds(profile, college),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return { student, recommendations: scored };
}

/**
 * Cross-student list-balance report (fix plan 10.8): every active student's
 * list classified reach/target/likely, with imbalance warnings. Staff-only;
 * scoped staff see only their assigned students.
 */
export async function getListBalanceReport() {
  const ctx = await resolveUserAndFirm();
  if (!ctx || !isStaffRole(ctx.role)) return [];
  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  const db = getDb();
  let query = db
    .from("students")
    .select(
      `id, first_name, last_name, graduation_year,
       student_profiles(sat_score, act_score),
       student_colleges(
         id, category,
         colleges(acceptance_rate, sat_avg, act_avg)
       )`
    )
    .eq("firm_id", ctx.firmId)
    .eq("status", "active")
    .order("graduation_year", { ascending: true });
  if (scopedIds !== null) query = query.in("id", scopedIds);

  const { data, error } = await query;
  if (error) {
    console.error("Failed to fetch list balance report:", error);
    return [];
  }

  return (data ?? []).map((s) => {
    const profile = (
      Array.isArray(s.student_profiles)
        ? s.student_profiles[0]
        : s.student_profiles
    ) as { sat_score: number | null; act_score: number | null } | null;
    const listRows = (
      ((s as Record<string, unknown>).student_colleges as Array<{
        id: string;
        category: string;
        colleges:
          | { acceptance_rate: number | null; sat_avg: number | null; act_avg: number | null }
          | { acceptance_rate: number | null; sat_avg: number | null; act_avg: number | null }[]
          | null;
      }>) ?? []
    );
    const odds = listRows.map((row) => {
      const college = Array.isArray(row.colleges)
        ? row.colleges[0]
        : row.colleges;
      return college ? classifyAdmissionOdds(profile, college) : null;
    });
    return {
      student_id: s.id,
      student_name: `${s.first_name} ${s.last_name}`,
      graduation_year: s.graduation_year,
      list_size: listRows.length,
      balance: computeListBalance(odds),
    };
  });
}

// ---------------------------------------------------------------------------
// College Research Notes
// ---------------------------------------------------------------------------
export async function getCollegeResearchNotes(collegeId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = getDb();

  // Get all student_college entries for this college
  const { data: studentColleges } = await db
    .from("student_colleges")
    .select("id")
    .eq("college_id", collegeId)
    .eq("firm_id", ctx.firmId);

  if (!studentColleges || studentColleges.length === 0) return [];

  const scIds = studentColleges.map((sc) => sc.id);

  const { data: notes } = await db
    .from("notes")
    .select(
      `id, title, body, note_type, created_at,
       users:created_by_user_id(first_name, last_name),
       student_colleges!inner(
         students(first_name, last_name)
       )`
    )
    .eq("firm_id", ctx.firmId)
    .in("student_college_id", scIds)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  return (notes ?? []).map((n) => {
    const author = (n as Record<string, unknown>).users as
      | { first_name: string; last_name: string }
      | undefined;
    const sc = (n as Record<string, unknown>).student_colleges as
      | { students: { first_name: string; last_name: string } | null }
      | undefined;
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      note_type: n.note_type,
      created_at: n.created_at,
      author_name: author ? `${author.first_name} ${author.last_name}` : "Unknown",
      student_name: sc?.students
        ? `${sc.students.first_name} ${sc.students.last_name}`
        : null,
    };
  });
}

// ---------------------------------------------------------------------------
// College Fit Analysis
// ---------------------------------------------------------------------------
export async function getCollegeFitAnalysis(collegeId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { college: null, students: [] };

  const db = getDb();

  const { data: college } = await db
    .from("colleges")
    .select("*")
    .eq("id", collegeId)
    .single();

  if (!college) return { college: null, students: [] };

  // Get students who have this college on their list
  const { data: studentColleges } = await db
    .from("student_colleges")
    .select(
      `id, category, counselor_fit_rating,
       students(id, first_name, last_name, gpa_unweighted, gpa_weighted,
                student_profiles(sat_score, act_score, financial_aid_needed, geographic_preferences))`
    )
    .eq("college_id", collegeId)
    .eq("firm_id", ctx.firmId);

  if (!studentColleges) return { college, students: [] };

  const analyzed = studentColleges.map((sc) => {
    const student = (sc as Record<string, unknown>).students as {
      id: string;
      first_name: string;
      last_name: string;
      gpa_unweighted: number | null;
      gpa_weighted: number | null;
      student_profiles:
        | {
            sat_score: number | null;
            act_score: number | null;
            financial_aid_needed: boolean | null;
            geographic_preferences: string[] | null;
          }
        | { sat_score: number | null; act_score: number | null; financial_aid_needed: boolean | null; geographic_preferences: string[] | null }[]
        | null;
    } | null;

    if (!student) return null;

    const profile = Array.isArray(student.student_profiles)
      ? student.student_profiles[0]
      : student.student_profiles;

    const dimensions: { label: string; score: "strong" | "moderate" | "weak" | "unknown"; detail: string }[] = [];

    // Academic fit (SAT)
    const studentSAT = profile?.sat_score ?? null;
    const collegeSAT = college.sat_avg as number | null;
    if (studentSAT && collegeSAT) {
      const diff = studentSAT - collegeSAT;
      if (diff >= -30) dimensions.push({ label: "SAT", score: "strong", detail: `${studentSAT} vs avg ${collegeSAT}` });
      else if (diff >= -100) dimensions.push({ label: "SAT", score: "moderate", detail: `${studentSAT} vs avg ${collegeSAT}` });
      else dimensions.push({ label: "SAT", score: "weak", detail: `${studentSAT} vs avg ${collegeSAT}` });
    } else {
      dimensions.push({ label: "SAT", score: "unknown", detail: "Missing data" });
    }

    // Academic fit (ACT)
    const studentACT = profile?.act_score ?? null;
    const collegeACT = college.act_avg as number | null;
    if (studentACT && collegeACT) {
      const diff = studentACT - collegeACT;
      if (diff >= -1) dimensions.push({ label: "ACT", score: "strong", detail: `${studentACT} vs avg ${collegeACT}` });
      else if (diff >= -3) dimensions.push({ label: "ACT", score: "moderate", detail: `${studentACT} vs avg ${collegeACT}` });
      else dimensions.push({ label: "ACT", score: "weak", detail: `${studentACT} vs avg ${collegeACT}` });
    } else {
      dimensions.push({ label: "ACT", score: "unknown", detail: "Missing data" });
    }

    // Selectivity fit
    const acceptRate = college.acceptance_rate as number | null;
    if (acceptRate != null) {
      if (acceptRate >= 0.5) dimensions.push({ label: "Selectivity", score: "strong", detail: `${(acceptRate * 100).toFixed(0)}% acceptance rate` });
      else if (acceptRate >= 0.25) dimensions.push({ label: "Selectivity", score: "moderate", detail: `${(acceptRate * 100).toFixed(0)}% acceptance rate` });
      else dimensions.push({ label: "Selectivity", score: "weak", detail: `${(acceptRate * 100).toFixed(0)}% acceptance rate` });
    }

    // Financial fit
    const needsAid = profile?.financial_aid_needed ?? null;
    const netPrice = college.net_price_avg as number | null;
    if (netPrice != null) {
      if (needsAid && netPrice < 20000) dimensions.push({ label: "Affordability", score: "strong", detail: `Net price $${netPrice.toLocaleString()}` });
      else if (netPrice < 35000) dimensions.push({ label: "Affordability", score: "moderate", detail: `Net price $${netPrice.toLocaleString()}` });
      else dimensions.push({ label: "Affordability", score: needsAid ? "weak" : "moderate", detail: `Net price $${netPrice.toLocaleString()}` });
    }

    // Geographic fit
    const geoPrefs = (profile?.geographic_preferences ?? []) as string[];
    const collegeState = college.state_region as string | null;
    if (geoPrefs.length > 0 && collegeState) {
      const matches = geoPrefs.some(
        (p: string) => p.toLowerCase() === collegeState.toLowerCase()
      );
      dimensions.push({
        label: "Location",
        score: matches ? "strong" : "moderate",
        detail: matches ? `${collegeState} matches preferences` : `${collegeState} not in preferences`,
      });
    }

    return {
      student_college_id: sc.id,
      student_id: student.id,
      student_name: `${student.first_name} ${student.last_name}`,
      category: sc.category,
      counselor_fit_rating: sc.counselor_fit_rating,
      dimensions,
    };
  }).filter(Boolean);

  return { college, students: analyzed };
}

// ---------------------------------------------------------------------------
// Bulk Sync Status
// ---------------------------------------------------------------------------
export async function getBulkSyncStatus() {
  try {
    const db = getDb();

    const { data, error } = await db
      .from("audit_events")
      .select("action_type, metadata_json, created_at")
      .eq("entity_type", "scorecard_sync")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Failed to fetch bulk sync status:", error);
      return null;
    }

    const row = data?.[0];
    if (!row) return null;

    return {
      action: row.action_type as string,
      metadata: (row.metadata_json ?? {}) as Record<string, unknown>,
      created_at: row.created_at as string,
    };
  } catch (e) {
    console.error("getBulkSyncStatus error:", e);
    return null;
  }
}

export async function getUnsyncedCollegeCount() {
  try {
    const db = getDb();

    const [unsyncedResult, totalResult, staleResult] = await Promise.all([
      db
        .from("colleges")
        .select("id", { count: "exact", head: true })
        .is("scorecard_synced_at", null),
      db
        .from("colleges")
        .select("id", { count: "exact", head: true }),
      db
        .from("colleges")
        .select("id", { count: "exact", head: true })
        .lt(
          "scorecard_synced_at",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        ),
    ]);

    return {
      unsynced: unsyncedResult.count ?? 0,
      total: totalResult.count ?? 0,
      stale: staleResult.count ?? 0,
    };
  } catch (e) {
    console.error("getUnsyncedCollegeCount error:", e);
    return { unsynced: 0, total: 0, stale: 0 };
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export async function getTasks(filters?: {
  search?: string;
  status?: string;
  view?: "my" | "team" | "student";
}) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  const db = getDb();
  let query = db
    .from("tasks")
    .select(
      `id, title, description, task_type, status, priority, visibility_scope,
       due_at, completed_at, created_at,
       assigned_user:assigned_user_id(id, first_name, last_name),
       students(id, first_name, last_name)`
    )
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (scopedIds !== null) {
    query = query.in("student_id", scopedIds);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.view === "my") {
    query = query.eq("assigned_user_id", ctx.dbUserId);
  } else if (filters?.view === "student") {
    query = query.not("student_id", "is", null);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch tasks:", error);
    return [];
  }

  let results = (data ?? []).map((t) => {
    const assigned = (t as Record<string, unknown>).assigned_user as
      | { id: string; first_name: string; last_name: string }
      | undefined;
    const student = (t as Record<string, unknown>).students as
      | { id: string; first_name: string; last_name: string }
      | undefined;
    return {
      id: t.id,
      title: t.title,
      description: t.description as string | null,
      task_type: t.task_type,
      status: t.status,
      priority: t.priority,
      visibility_scope: t.visibility_scope,
      due_at: t.due_at,
      completed_at: t.completed_at,
      created_at: t.created_at,
      assigned_to: assigned
        ? `${assigned.first_name} ${assigned.last_name}`
        : null,
      assigned_user_id: assigned?.id ?? null,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : null,
      student_id: student?.id ?? null,
    };
  });

  if (filters?.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (t) =>
        t.title.toLowerCase().includes(term) ||
        t.student_name?.toLowerCase().includes(term) ||
        t.assigned_to?.toLowerCase().includes(term)
    );
  }

  return results;
}

export async function getStaffForSelect() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = getDb();
  const { data } = await db
    .from("firm_memberships")
    .select("user_id, users:user_id(id, first_name, last_name)")
    .eq("firm_id", ctx.firmId)
    .eq("status", "active")
    .in("role", [...STAFF_ROLE_LIST]);

  return (data ?? []).map((m) => {
    const user = (m as Record<string, unknown>).users as {
      id: string;
      first_name: string;
      last_name: string;
    };
    return { id: user.id, name: `${user.first_name} ${user.last_name}` };
  });
}

// ---------------------------------------------------------------------------
// Conversations & Messages
// ---------------------------------------------------------------------------

/** Recent-activity cap for the staff inbox (fix plan 11.1). */
export const CONVERSATIONS_WINDOW = 200;

export async function getConversations(filters?: { search?: string }) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  const db = getDb();

  let query = db
    .from("conversations")
    .select(
      `id, conversation_type, visibility_scope, created_at, updated_at,
       students(id, first_name, last_name),
       conversation_participants(
         user_id,
         users:user_id(first_name, last_name)
       ),
       messages(id, body, sent_at, sender_user_id,
         message_reads(user_id),
         sender:sender_user_id(first_name, last_name)
       )`
    )
    .eq("firm_id", ctx.firmId)
    .order("updated_at", { ascending: false })
    // Bound the whole-firm fetch (fix plan 11.1). The inbox is a recent-
    // activity list, not a paged table; the client shows a notice when the
    // cap is reached. Full inbox search/pagination folds into the Phase-12
    // messaging work (which also denormalizes last-message/unread so this
    // stops pulling every message of every thread).
    .limit(CONVERSATIONS_WINDOW);

  if (scopedIds !== null) {
    query = query.in("student_id", scopedIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch conversations:", error);
    return [];
  }

  let results = (data ?? []).map((c) => {
    const student = (c as Record<string, unknown>).students as
      | { id: string; first_name: string; last_name: string }
      | undefined;
    const participants = (
      (c as Record<string, unknown>).conversation_participants as Array<{
        user_id: string;
        users: { first_name: string; last_name: string };
      }>
    ) ?? [];
    const messages = (
      (c as Record<string, unknown>).messages as Array<{
        id: string;
        body: string;
        sent_at: string;
        sender_user_id: string;
        message_reads: Array<{ user_id: string }> | null;
        sender: { first_name: string; last_name: string };
      }>
    ) ?? [];

    const sorted = [...messages].sort(
      (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    );
    const latest = sorted[0] ?? null;
    const unreadCount = messages.filter(
      (m) =>
        m.sender_user_id !== ctx.dbUserId &&
        !(m.message_reads ?? []).some((r) => r.user_id === ctx.dbUserId)
    ).length;

    return {
      id: c.id,
      conversation_type: c.conversation_type,
      visibility_scope: c.visibility_scope,
      created_at: c.created_at,
      updated_at: c.updated_at,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : null,
      participants: participants.map(
        (p) => `${p.users.first_name} ${p.users.last_name}`
      ),
      last_message: latest?.body ?? null,
      last_message_at: latest?.sent_at ?? null,
      last_sender: latest
        ? `${latest.sender.first_name} ${latest.sender.last_name}`
        : null,
      unread_count: unreadCount,
    };
  });

  if (filters?.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (c) =>
        c.student_name?.toLowerCase().includes(term) ||
        c.participants.some((p) => p.toLowerCase().includes(term)) ||
        c.last_message?.toLowerCase().includes(term)
    );
  }

  return results;
}

export async function getConversationMessages(conversationId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = getDb();

  const { data: conv } = await db
    .from("conversations")
    .select(
      `id, conversation_type, visibility_scope,
       students(id, first_name, last_name),
       conversation_participants(
         user_id,
         users:user_id(id, first_name, last_name)
       )`
    )
    .eq("id", conversationId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!conv) return null;

  const participantRows = (conv as Record<string, unknown>)
    .conversation_participants as Array<{ user_id: string }> | null;
  const isParticipant = (participantRows ?? []).some(
    (row) => row.user_id === ctx.dbUserId
  );
  if (!isStaffRole(ctx.role) && !isParticipant) return null;

  const { data: messages } = await db
    .from("messages")
    .select(
      `id, body, sent_at, edited_at,
       sender:sender_user_id(id, first_name, last_name),
       message_attachments(document_id, documents(id, title))`
    )
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("sent_at", { ascending: true });

  const student = (conv as Record<string, unknown>).students as
    | { id: string; first_name: string; last_name: string }
    | undefined;
  const participants = (
    (conv as Record<string, unknown>).conversation_participants as Array<{
      user_id: string;
      users: { id: string; first_name: string; last_name: string };
    }>
  ) ?? [];

  return {
    id: conv.id,
    conversation_type: conv.conversation_type,
    visibility_scope: conv.visibility_scope,
    student_name: student
      ? `${student.first_name} ${student.last_name}`
      : null,
    participants: participants.map((p) => ({
      id: p.users.id,
      name: `${p.users.first_name} ${p.users.last_name}`,
    })),
    messages: (messages ?? []).map((m) => {
      const sender = (m as Record<string, unknown>).sender as {
        id: string;
        first_name: string;
        last_name: string;
      };
      const attachments = (
        ((m as Record<string, unknown>).message_attachments as Array<{
          document_id: string;
          documents: { id: string; title: string } | { id: string; title: string }[] | null;
        }>) ?? []
      )
        .map((a) => {
          const doc = Array.isArray(a.documents) ? a.documents[0] : a.documents;
          return doc ? { id: doc.id, title: doc.title } : null;
        })
        .filter((a): a is { id: string; title: string } => a !== null);
      return {
        id: m.id,
        body: m.body,
        sent_at: m.sent_at,
        edited_at: m.edited_at,
        sender_id: sender.id,
        sender_name: `${sender.first_name} ${sender.last_name}`,
        is_mine: sender.id === ctx.dbUserId,
        attachments,
      };
    }),
    current_user_id: ctx.dbUserId,
  };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export async function getDocuments(filters?: {
  search?: string;
  category?: string;
  page?: number;
  sort?: ListSort;
}): Promise<Paginated<{
  id: string;
  title: string;
  category: string;
  mime_type: string;
  file_size_bytes: number | null;
  storage_key: string;
  visibility_scope: string;
  created_at: string;
  student_name: string | null;
  uploaded_by: string;
}>> {
  const page = resolvePage(filters?.page);
  const ctx = await resolveUserAndFirm();
  if (!ctx) return EMPTY_PAGE(page);

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return EMPTY_PAGE(page);

  const db = getDb();
  const { from, to } = pageBounds(page, LIST_PAGE_SIZE);
  const asc = filters?.sort?.dir === "asc";

  let query = db
    .from("documents")
    .select(
      `id, title, category, mime_type, file_size_bytes, storage_key,
       visibility_scope, created_at,
       students(id, first_name, last_name),
       uploader:uploaded_by_user_id(first_name, last_name)`,
      { count: "exact" }
    )
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null);

  // Server-side sort over real DB columns (student_name/uploaded_by are
  // derived join fields and are not sortable). Default: newest first.
  if (filters?.sort?.key === "title") {
    query = query.order("title", { ascending: asc });
  } else if (filters?.sort?.key === "category") {
    query = query.order("category", { ascending: asc });
  } else {
    query = query.order("created_at", {
      ascending: filters?.sort?.key === "created_at" ? asc : false,
    });
  }

  if (scopedIds !== null) {
    query = query.in("student_id", scopedIds);
  }
  if (filters?.category) {
    query = query.eq("category", filters.category);
  }

  // Search moves into the DB so pagination + count stay correct. Title match
  // plus student-name match, the latter resolved to student ids first so the
  // cross-field search survives (it used to filter the fetched page in JS).
  if (filters?.search) {
    const term = filters.search.replace(/[%,()]/g, " ").trim();
    if (term) {
      const { data: matchedStudents } = await db
        .from("students")
        .select("id")
        .eq("firm_id", ctx.firmId)
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
      const ids = (matchedStudents ?? []).map((s) => s.id);
      const clauses = [`title.ilike.%${term}%`];
      if (ids.length > 0) clauses.push(`student_id.in.(${ids.join(",")})`);
      query = query.or(clauses.join(","));
    }
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error("Failed to fetch documents:", error);
    return EMPTY_PAGE(page);
  }

  const rows = (data ?? []).map((d) => {
    const student = (d as Record<string, unknown>).students as
      | { id: string; first_name: string; last_name: string }
      | undefined;
    const uploader = (d as Record<string, unknown>).uploader as
      | { first_name: string; last_name: string }
      | undefined;
    return {
      id: d.id,
      title: d.title,
      category: d.category,
      mime_type: d.mime_type,
      file_size_bytes: d.file_size_bytes as number | null,
      storage_key: d.storage_key,
      visibility_scope: d.visibility_scope,
      created_at: d.created_at,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : null,
      uploaded_by: uploader
        ? `${uploader.first_name} ${uploader.last_name}`
        : "Unknown",
    };
  });

  return { rows, total: count ?? rows.length, page, pageSize: LIST_PAGE_SIZE };
}

// ---------------------------------------------------------------------------
// Document requests + version history (fix plan 10.5)
// ---------------------------------------------------------------------------

export interface DocumentRequestRow {
  id: string;
  title: string;
  category: string;
  note: string | null;
  due_at: string | null;
  status: string;
  created_at: string;
  fulfilled_at: string | null;
  student_id: string | null;
  student_name: string | null;
  requested_by: string;
}

function mapDocumentRequestRows(
  data: Record<string, unknown>[] | null
): DocumentRequestRow[] {
  return (data ?? []).map((r) => {
    const student = (Array.isArray(r.students) ? r.students[0] : r.students) as
      | { id: string; first_name: string; last_name: string }
      | null;
    const requester = (
      Array.isArray(r.requester) ? r.requester[0] : r.requester
    ) as { first_name: string; last_name: string } | null;
    return {
      id: r.id as string,
      title: r.title as string,
      category: r.category as string,
      note: r.note as string | null,
      due_at: r.due_at as string | null,
      status: r.status as string,
      created_at: r.created_at as string,
      fulfilled_at: r.fulfilled_at as string | null,
      student_id: r.student_id as string | null,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : null,
      requested_by: requester
        ? `${requester.first_name} ${requester.last_name}`
        : "Staff",
    };
  });
}

const DOCUMENT_REQUEST_SELECT = `id, title, category, note, due_at, status,
  created_at, fulfilled_at, student_id,
  students(id, first_name, last_name),
  requester:requested_by_user_id(first_name, last_name)`;

/** Staff view: the firm's document requests, open ones first. */
export async function getDocumentRequests(): Promise<DocumentRequestRow[]> {
  const ctx = await resolveUserAndFirm();
  if (!ctx || !isStaffRole(ctx.role)) return [];

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  const db = getDb();
  let query = db
    .from("document_requests")
    .select(DOCUMENT_REQUEST_SELECT)
    .eq("firm_id", ctx.firmId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (scopedIds !== null) query = query.in("student_id", scopedIds);

  const { data, error } = await query;
  if (error) {
    console.error("Failed to fetch document requests:", error);
    return [];
  }
  const rows = mapDocumentRequestRows(data);
  return [
    ...rows.filter((r) => r.status === "requested"),
    ...rows.filter((r) => r.status !== "requested"),
  ];
}

/** Student portal: open requests aimed at this student. */
export async function getStudentOpenDocumentRequests(): Promise<
  DocumentRequestRow[]
> {
  const resolved = await resolveStudentForPortal();
  if (!resolved) return [];
  const { ctx, studentId, db } = resolved;
  const { data, error } = await db
    .from("document_requests")
    .select(DOCUMENT_REQUEST_SELECT)
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .eq("status", "requested")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to fetch student document requests:", error);
    return [];
  }
  return mapDocumentRequestRows(data);
}

/** Family portal: open requests for the household's students. */
export async function getParentOpenDocumentRequests(): Promise<
  DocumentRequestRow[]
> {
  const resolved = await resolveParentForPortal();
  if (!resolved) return [];
  const { ctx, familyId, db } = resolved;
  const { data, error } = await db
    .from("document_requests")
    .select(DOCUMENT_REQUEST_SELECT)
    .eq("firm_id", ctx.firmId)
    .eq("family_id", familyId)
    .eq("status", "requested")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to fetch family document requests:", error);
    return [];
  }
  return mapDocumentRequestRows(data);
}

/**
 * Version history for one document. Access is the same check the download
 * endpoint uses (requireDocumentAccess), applied by the caller (server
 * action) — this stays a firm-scoped read.
 */
export async function getDocumentVersions(documentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];
  const db = getDb();
  const { data: doc } = await db
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!doc) return [];
  const { data, error } = await db
    .from("document_versions")
    .select(
      `id, version_number, created_at,
       uploader:uploaded_by_user_id(first_name, last_name)`
    )
    .eq("document_id", documentId)
    .order("version_number", { ascending: false });
  if (error) {
    console.error("Failed to fetch document versions:", error);
    return [];
  }
  return (data ?? []).map((v) => {
    const uploader = (
      Array.isArray(v.uploader) ? v.uploader[0] : v.uploader
    ) as { first_name: string; last_name: string } | null;
    return {
      id: v.id,
      version_number: v.version_number,
      created_at: v.created_at,
      uploaded_by: uploader
        ? `${uploader.first_name} ${uploader.last_name}`
        : "Unknown",
    };
  });
}

// ---------------------------------------------------------------------------
// Aid awards & testing plan (fix plan 10.6)
// ---------------------------------------------------------------------------

export interface AidComparisonRow {
  application_id: string;
  college_name: string;
  round: string | null;
  decision_result: string | null;
  deposit_status: string | null;
  cost_of_attendance: number | null;
  tuition_estimate: number | null;
  awards: {
    id: string;
    kind: string;
    name: string;
    annual_amount: number;
    renewable: boolean;
  }[];
}

function mapAidComparisonRows(
  data: Record<string, unknown>[] | null
): AidComparisonRow[] {
  return (data ?? []).map((a) => {
    const college = (Array.isArray(a.colleges) ? a.colleges[0] : a.colleges) as {
      name: string;
      tuition_in_state: number | null;
      tuition_out_state: number | null;
      net_price_avg: number | null;
    } | null;
    const listRow = (
      Array.isArray(a.student_colleges) ? a.student_colleges[0] : a.student_colleges
    ) as { round_type: string | null; deposit_status: string | null } | null;
    return {
      application_id: a.id as string,
      college_name: college?.name ?? "Unknown",
      round: listRow?.round_type ?? (a.application_type as string | null),
      decision_result: a.decision_result as string | null,
      deposit_status: listRow?.deposit_status ?? null,
      cost_of_attendance: a.cost_of_attendance as number | null,
      // Sticker tuition (out-of-state as the conservative default) — used
      // only when no award-letter cost has been recorded.
      tuition_estimate:
        college?.tuition_out_state ?? college?.tuition_in_state ?? null,
      awards: (
        (a.aid_awards as AidComparisonRow["awards"] | null) ?? []
      ).slice(),
    };
  });
}

const AID_COMPARISON_SELECT = `id, application_type, decision_result,
  cost_of_attendance,
  colleges(name, tuition_in_state, tuition_out_state, net_price_avg),
  student_colleges(round_type, deposit_status),
  aid_awards(id, kind, name, annual_amount, renewable)`;

/** Staff: accepted applications with award + cost data for one student. */
export async function getAidComparison(
  studentId: string
): Promise<AidComparisonRow[]> {
  const ctx = await resolveUserAndFirm();
  if (!ctx || !isStaffRole(ctx.role)) return [];
  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && !scopedIds.includes(studentId)) return [];

  const db = getDb();
  const { data, error } = await db
    .from("applications")
    .select(AID_COMPARISON_SELECT)
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .eq("decision_result", "accepted");
  if (error) {
    console.error("Failed to fetch aid comparison:", error);
    return [];
  }
  return mapAidComparisonRows(data);
}

/** Family portal: the household's accepted applications with aid data.
 * Aid is family-visible by design — it is the family's own financial info. */
export async function getParentAidComparison(): Promise<
  { student_name: string; rows: AidComparisonRow[] }[]
> {
  const resolved = await resolveParentForPortal();
  if (!resolved) return [];
  const { ctx, studentIds, db } = resolved;
  if (studentIds.length === 0) return [];

  const { data, error } = await db
    .from("applications")
    .select(
      `${AID_COMPARISON_SELECT}, student_id,
       students(first_name, last_name)`
    )
    .eq("firm_id", ctx.firmId)
    .in("student_id", studentIds)
    .eq("decision_result", "accepted");
  if (error) {
    console.error("Failed to fetch family aid comparison:", error);
    return [];
  }

  const byStudent = new Map<string, { student_name: string; raw: Record<string, unknown>[] }>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const student = (
      Array.isArray(row.students) ? row.students[0] : row.students
    ) as { first_name: string; last_name: string } | null;
    const key = row.student_id as string;
    if (!byStudent.has(key)) {
      byStudent.set(key, {
        student_name: student
          ? `${student.first_name} ${student.last_name}`
          : "Student",
        raw: [],
      });
    }
    byStudent.get(key)!.raw.push(row);
  }
  return [...byStudent.values()].map((group) => ({
    student_name: group.student_name,
    rows: mapAidComparisonRows(group.raw),
  }));
}

export interface TestSittingRow {
  id: string;
  test_type: string;
  test_date: string | null;
  registration_deadline: string | null;
  status: string;
  score: string | null;
  notes: string | null;
}

const TEST_SITTING_SELECT =
  "id, test_type, test_date, registration_deadline, status, score, notes";

/** Staff: one student's testing plan, soonest first. */
export async function getStudentTestSittings(
  studentId: string
): Promise<TestSittingRow[]> {
  const ctx = await resolveUserAndFirm();
  if (!ctx || !isStaffRole(ctx.role)) return [];
  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && !scopedIds.includes(studentId)) return [];

  const db = getDb();
  const { data, error } = await db
    .from("test_sittings")
    .select(TEST_SITTING_SELECT)
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .order("test_date", { ascending: true, nullsFirst: false });
  if (error) {
    console.error("Failed to fetch test sittings:", error);
    return [];
  }
  return data ?? [];
}

/** Student portal: own testing plan (inherently student-visible). */
export async function getMyTestSittings(): Promise<TestSittingRow[]> {
  const resolved = await resolveStudentForPortal();
  if (!resolved) return [];
  const { ctx, studentId, db } = resolved;
  const { data, error } = await db
    .from("test_sittings")
    .select(TEST_SITTING_SELECT)
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .order("test_date", { ascending: true, nullsFirst: false });
  if (error) {
    console.error("Failed to fetch portal test sittings:", error);
    return [];
  }
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------
export async function getFamilies(filters?: {
  search?: string;
  archived?: boolean;
  page?: number;
  sort?: ListSort;
}): Promise<Paginated<{
  id: string;
  household_name: string;
  city: string | null;
  state_region: string | null;
  student_count: number;
  primary_contact: string | null;
}>> {
  const page = resolvePage(filters?.page);
  const ctx = await resolveUserAndFirm();
  if (!ctx) return EMPTY_PAGE(page);

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return EMPTY_PAGE(page);

  const db = getDb();
  const { from, to } = pageBounds(page, LIST_PAGE_SIZE);
  const asc = filters?.sort?.dir !== "desc";

  // Role-scoped users: an inner join on their assigned students filters the
  // households in-DB (so the exact count is right and pagination is correct)
  // and returns only the assigned children for the count. Owner/admin get a
  // plain left join over all children.
  const studentsSelect =
    scopedIds === null ? "students(id)" : "students!inner(id)";

  let query = db
    .from("families")
    .select(
      `id, household_name, city, state_region,
       ${studentsSelect},
       family_members(is_primary_contact, users:user_id(first_name, last_name))`,
      { count: "exact" }
    )
    .eq("firm_id", ctx.firmId);

  if (scopedIds !== null) {
    query = query.in("students.id", scopedIds);
  }

  // Server-side sort — real DB columns only (contact/count are derived).
  if (filters?.sort?.key === "city") {
    query = query.order("city", { ascending: asc });
  } else {
    query = query.order("household_name", { ascending: asc });
  }

  // Archived households leave the roster but stay reachable through the
  // Archived view (fix plan 7.5) — that's also how they get restored.
  if (filters?.archived) {
    query = query.not("archived_at", "is", null);
  } else {
    query = query.is("archived_at", null);
  }

  if (filters?.search) {
    query = query.ilike("household_name", `%${filters.search}%`);
  }

  const { data, error, count } = await query.range(from, to);
  assertNoQueryError(error, "getFamilies");

  const rows = (data ?? []).map((f) => {
    const members = (f as Record<string, unknown>).family_members as
      | Array<{
          is_primary_contact: boolean;
          users: { first_name: string; last_name: string };
        }>
      | undefined;
    const primary = members?.find((m) => m.is_primary_contact);
    const contact = primary?.users ?? members?.[0]?.users;
    const students = ((f as Record<string, unknown>).students as
      | Array<{ id: string }>
      | undefined) ?? [];

    return {
      id: f.id,
      household_name: f.household_name,
      city: f.city,
      state_region: f.state_region,
      student_count: students.length,
      primary_contact: contact
        ? `${contact.first_name} ${contact.last_name}`
        : null,
    };
  });

  return { rows, total: count ?? rows.length, page, pageSize: LIST_PAGE_SIZE };
}

/** Lightweight full family list for pickers (new-student form, API route). */
export async function getFamiliesForSelect(): Promise<
  Array<{ id: string; household_name: string }>
> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const scopedIds = await getAssignedStudentIds(ctx);
  const db = getDb();

  // Owner/admin: every household. Literal select strings keep the Supabase
  // type parser happy (a computed select string is typed too loosely).
  if (scopedIds === null) {
    const { data } = await db
      .from("families")
      .select("id, household_name")
      .eq("firm_id", ctx.firmId)
      .is("archived_at", null)
      .order("household_name", { ascending: true });
    return data ?? [];
  }

  if (scopedIds.length === 0) return [];

  // Role-scoped: only households containing an assigned student.
  const { data } = await db
    .from("families")
    .select("id, household_name, students!inner(id)")
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null)
    .in("students.id", scopedIds)
    .order("household_name", { ascending: true });

  // Dedupe: the inner join can repeat a family once per assigned child.
  const seen = new Set<string>();
  const out: Array<{ id: string; household_name: string }> = [];
  for (const f of data ?? []) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push({ id: f.id, household_name: f.household_name });
  }
  return out;
}

export async function getFamilyById(id: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return null;

  const db = getDb();
  const { data: family } = await db
    .from("families")
    .select("*")
    .eq("id", id)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!family) return null;

  let studentsQuery = db
    .from("students")
    .select("id, first_name, last_name, graduation_year, status")
    .eq("family_id", id)
    .eq("firm_id", ctx.firmId);
  if (scopedIds !== null) {
    studentsQuery = studentsQuery.in("id", scopedIds);
  }

  const [members, students, notes, documents, invitations] = await Promise.all([
    db
      .from("family_members")
      .select(
        "id, relationship_type, is_primary_contact, users:user_id(id, first_name, last_name, email, auth_provider_user_id)"
      )
      .eq("family_id", id)
      .eq("firm_id", ctx.firmId),
    studentsQuery,
    db
      .from("notes")
      .select("id, title, body, created_at, note_type, visibility_scope")
      .is("archived_at", null)
      .eq("firm_id", ctx.firmId)
      .eq("family_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("documents")
      .select("id, title, category, created_at")
      .eq("firm_id", ctx.firmId)
      .eq("family_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("family_invitations")
      .select("id, family_member_id, email, status, sent_at, accepted_at")
      .eq("firm_id", ctx.firmId)
      .eq("family_id", id)
      .order("sent_at", { ascending: false }),
  ]);

  // Role-scoped user with no assigned children in this family can't see it.
  if (scopedIds !== null && (students.data ?? []).length === 0) {
    return null;
  }

  // Per-member portal status for the invite controls: a member has an active
  // account when their linked user is no longer an "invited_" placeholder.
  const inviteRows = invitations.data ?? [];
  const membersWithPortal = (members.data ?? []).map((m) => {
    const memberUser = (m as Record<string, unknown>).users as {
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      auth_provider_user_id: string;
    } | null;
    const pendingInvite =
      inviteRows.find(
        (inv) => inv.family_member_id === m.id && inv.status === "pending"
      ) ?? null;
    const hasAccount =
      !!memberUser && !isPlaceholderUser(memberUser.auth_provider_user_id);
    return {
      id: m.id,
      relationship_type: m.relationship_type,
      is_primary_contact: m.is_primary_contact,
      users: memberUser
        ? {
            first_name: memberUser.first_name,
            last_name: memberUser.last_name,
            email: memberUser.email,
          }
        : { first_name: "Unknown", last_name: "", email: "" },
      portal_status: hasAccount
        ? ("active" as const)
        : pendingInvite
          ? ("pending" as const)
          : ("none" as const),
      pending_invitation: pendingInvite
        ? {
            id: pendingInvite.id,
            email: pendingInvite.email,
            sent_at: pendingInvite.sent_at,
          }
        : null,
    };
  });

  return {
    ...family,
    members: membersWithPortal,
    students: students.data ?? [],
    recentNotes: notes.data ?? [],
    recentDocuments: documents.data ?? [],
  };
}

// ---------------------------------------------------------------------------
// Student & Family Meetings
// ---------------------------------------------------------------------------
export async function getStudentMeetings(studentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = getDb();
  const { data } = await db
    .from("meetings")
    .select("id, title, meeting_type, scheduled_start_at, scheduled_end_at, location_text")
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .gte("scheduled_start_at", new Date().toISOString())
    .order("scheduled_start_at", { ascending: true })
    .limit(10);

  return data ?? [];
}

export async function getFamilyMeetings(familyId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = getDb();

  // Find all students in this family
  const { data: students } = await db
    .from("students")
    .select("id")
    .eq("family_id", familyId)
    .eq("firm_id", ctx.firmId);

  if (!students || students.length === 0) return [];

  const studentIds = students.map((s) => s.id);

  const { data } = await db
    .from("meetings")
    .select(
      `id, title, meeting_type, scheduled_start_at, scheduled_end_at, location_text,
       students(first_name, last_name)`
    )
    .eq("firm_id", ctx.firmId)
    .in("student_id", studentIds)
    .gte("scheduled_start_at", new Date().toISOString())
    .order("scheduled_start_at", { ascending: true })
    .limit(10);

  return (data ?? []).map((m) => {
    const student = (m as Record<string, unknown>).students as
      | { first_name: string; last_name: string }
      | undefined;
    return {
      ...m,
      student_name: student ? `${student.first_name} ${student.last_name}` : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Meetings (Calendar)
// ---------------------------------------------------------------------------
/**
 * Portal-account clients per student (the student + their family's
 * parents/guardians with claimed accounts) for attendee/participant pickers.
 * Scoped to the caller's assigned students for non-firm-wide staff.
 */
export async function getClientsByStudent(): Promise<
  Record<string, { id: string; name: string; role: "student" | "parent" }[]>
> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return {};

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return {};

  const db = getDb();
  let studentsQuery = db
    .from("students")
    .select(
      "id, family_id, users:user_id(id, first_name, last_name, auth_provider_user_id)"
    )
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null);
  if (scopedIds !== null) {
    studentsQuery = studentsQuery.in("id", scopedIds);
  }
  const { data: students } = await studentsQuery;
  if (!students || students.length === 0) return {};

  const familyIds = Array.from(new Set(students.map((s) => s.family_id)));
  const { data: members } = await db
    .from("family_members")
    .select(
      "family_id, relationship_type, users:user_id(id, first_name, last_name, auth_provider_user_id)"
    )
    .eq("firm_id", ctx.firmId)
    .in("family_id", familyIds);

  const parentsByFamily = new Map<
    string,
    { id: string; name: string; role: "parent" }[]
  >();
  for (const m of members ?? []) {
    if (!["parent", "guardian"].includes(m.relationship_type)) continue;
    const u = m.users as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      auth_provider_user_id: string;
    } | null;
    if (!u || isPlaceholderUser(u.auth_provider_user_id)) continue;
    const list = parentsByFamily.get(m.family_id) ?? [];
    list.push({
      id: u.id,
      name: `${u.first_name} ${u.last_name}`,
      role: "parent",
    });
    parentsByFamily.set(m.family_id, list);
  }

  const result: Record<
    string,
    { id: string; name: string; role: "student" | "parent" }[]
  > = {};
  for (const s of students) {
    const clients: { id: string; name: string; role: "student" | "parent" }[] =
      [];
    const u = s.users as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      auth_provider_user_id: string;
    } | null;
    if (u && !isPlaceholderUser(u.auth_provider_user_id)) {
      clients.push({
        id: u.id,
        name: `${u.first_name} ${u.last_name}`,
        role: "student",
      });
    }
    clients.push(...(parentsByFamily.get(s.family_id) ?? []));
    result[s.id] = clients;
  }
  return result;
}

export async function getMeetings(filters?: {
  month?: number;
  year?: number;
  /** Explicit ISO range — used by the week/day calendar views (10.7);
   * takes precedence over month/year. */
  rangeStart?: string;
  rangeEnd?: string;
}) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  const db = getDb();

  const now = new Date();
  const year = filters?.year ?? now.getFullYear();
  const month = filters?.month ?? now.getMonth(); // 0-indexed

  const start = filters?.rangeStart
    ? new Date(filters.rangeStart)
    : new Date(year, month, 1);
  const end = filters?.rangeEnd
    ? new Date(filters.rangeEnd)
    : new Date(year, month + 1, 0, 23, 59, 59);

  let query = db
    .from("meetings")
    .select(
      `id, title, meeting_type, scheduled_start_at, scheduled_end_at,
       location_text, agenda, summary, visibility_scope, created_at,
       students(id, first_name, last_name),
       meeting_attendees(
         user_id, attendance_status,
         users:user_id(first_name, last_name)
       )`
    )
    .eq("firm_id", ctx.firmId)
    .gte("scheduled_start_at", start.toISOString())
    .lte("scheduled_start_at", end.toISOString())
    .order("scheduled_start_at", { ascending: true });

  if (scopedIds !== null) {
    query = query.in("student_id", scopedIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch meetings:", error);
    return [];
  }

  return (data ?? []).map((m) => {
    const student = (m as Record<string, unknown>).students as
      | { id: string; first_name: string; last_name: string }
      | undefined;
    const attendees = (
      (m as Record<string, unknown>).meeting_attendees as Array<{
        user_id: string;
        attendance_status: string | null;
        users: { first_name: string; last_name: string };
      }>
    ) ?? [];
    return {
      id: m.id,
      title: m.title,
      meeting_type: m.meeting_type,
      scheduled_start_at: m.scheduled_start_at,
      scheduled_end_at: m.scheduled_end_at,
      location_text: m.location_text,
      agenda: m.agenda,
      summary: m.summary,
      visibility_scope: m.visibility_scope,
      student_id: student?.id ?? null,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : null,
      attendees: attendees.map((a) => ({
        user_id: a.user_id,
        name: `${a.users.first_name} ${a.users.last_name}`,
        status: a.attendance_status,
      })),
    };
  });
}

export async function getUpcomingMeetings(limit = 10) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  const db = getDb();

  let query = db
    .from("meetings")
    .select(
      `id, title, meeting_type, scheduled_start_at, scheduled_end_at,
       location_text, students(first_name, last_name)`
    )
    .eq("firm_id", ctx.firmId)
    .gte("scheduled_start_at", new Date().toISOString())
    .order("scheduled_start_at", { ascending: true })
    .limit(limit);
  if (scopedIds !== null) {
    query = query.in("student_id", scopedIds);
  }
  const { data } = await query;

  return (data ?? []).map((m) => {
    const student = (m as Record<string, unknown>).students as
      | { first_name: string; last_name: string }
      | undefined;
    return {
      id: m.id,
      title: m.title,
      meeting_type: m.meeting_type,
      scheduled_start_at: m.scheduled_start_at,
      scheduled_end_at: m.scheduled_end_at,
      location_text: m.location_text,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : null,
    };
  });
}

export async function getUpcomingDeadlines(limit = 10) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  const db = getDb();

  let query = db
    .from("applications")
    .select(
      `id, stage, deadline_at,
       students(first_name, last_name),
       colleges(name)`
    )
    .eq("firm_id", ctx.firmId)
    .not("stage", "in", "(decision_received,withdrawn)")
    .gte("deadline_at", new Date().toISOString())
    .order("deadline_at", { ascending: true })
    .limit(limit);
  if (scopedIds !== null) {
    query = query.in("student_id", scopedIds);
  }
  const { data } = await query;

  return (data ?? []).map((a) => {
    const student = (a as Record<string, unknown>).students as
      | { first_name: string; last_name: string }
      | undefined;
    const college = (a as Record<string, unknown>).colleges as
      | { name: string }
      | undefined;
    return {
      id: a.id,
      stage: a.stage,
      deadline_at: a.deadline_at,
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : null,
      college_name: college?.name ?? "Unknown",
    };
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export async function getReportData(filters?: {
  classYear?: string;
  counselorId?: string;
}) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = getDb();

  // Scoping (fix plan 10.2): class-year and counselor narrow the firm-wide
  // aggregates. Counselor scoping resolves to their assigned student ids.
  const classYear = filters?.classYear ? parseInt(filters.classYear) : null;
  let counselorStudentIds: string[] | null = null;
  if (filters?.counselorId) {
    const { data } = await db
      .from("student_staff_assignments")
      .select("student_id")
      .eq("firm_id", ctx.firmId)
      .eq("user_id", filters.counselorId);
    counselorStudentIds = (data ?? []).map((r) => r.student_id);
  }

  // Sentinel keeps `.in()` valid when a counselor has zero assignments.
  const counselorIds =
    counselorStudentIds === null
      ? null
      : counselorStudentIds.length > 0
        ? counselorStudentIds
        : ["00000000-0000-4000-8000-000000000000"];

  let studentsQ = db
    .from("students")
    .select("status")
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null);
  if (classYear) studentsQ = studentsQ.eq("graduation_year", classYear);
  if (counselorIds) studentsQ = studentsQ.in("id", counselorIds);

  let appsQ = db
    .from("applications")
    .select("stage, students!inner(graduation_year)")
    .eq("firm_id", ctx.firmId);
  if (classYear) appsQ = appsQ.eq("students.graduation_year", classYear);
  if (counselorIds) appsQ = appsQ.in("student_id", counselorIds);

  let decisionsQ = db
    .from("applications")
    .select("decision_result, students!inner(graduation_year)")
    .eq("firm_id", ctx.firmId)
    .eq("stage", "decision_received")
    .not("decision_result", "is", null);
  if (classYear) decisionsQ = decisionsQ.eq("students.graduation_year", classYear);
  if (counselorIds) decisionsQ = decisionsQ.in("student_id", counselorIds);

  let tasksQ = db
    .from("tasks")
    .select("status")
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null);
  if (counselorIds) tasksQ = tasksQ.in("student_id", counselorIds);

  const [
    studentsByStatus,
    appsByStage,
    appDecisions,
    taskStats,
    messageCount,
    caseload,
  ] = await Promise.all([
    studentsQ,
    appsQ,
    decisionsQ,
    tasksQ,
    // Messages
    db
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", ctx.firmId),
    // Caseload: students per counselor
    db
      .from("student_staff_assignments")
      .select("user_id, assignment_type, users:user_id(first_name, last_name)")
      .eq("firm_id", ctx.firmId)
      .eq("is_primary", true),
  ]);

  // Count by group helper
  function countBy<T extends Record<string, unknown>>(
    rows: T[] | null,
    key: string
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const row of rows ?? []) {
      const val = String(row[key] ?? "unknown");
      counts[val] = (counts[val] ?? 0) + 1;
    }
    return counts;
  }

  // Caseload aggregation
  const counselorMap = new Map<string, { name: string; count: number }>();
  for (const a of caseload.data ?? []) {
    const user = (a as Record<string, unknown>).users as {
      first_name: string;
      last_name: string;
    };
    const key = a.user_id as string;
    const existing = counselorMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      counselorMap.set(key, {
        name: `${user.first_name} ${user.last_name}`,
        count: 1,
      });
    }
  }

  return {
    studentsByStatus: countBy(studentsByStatus.data, "status"),
    applicationsByStage: countBy(appsByStage.data, "stage"),
    decisionOutcomes: countBy(appDecisions.data, "decision_result"),
    tasksByStatus: countBy(taskStats.data, "status"),
    totalConversations: messageCount.count ?? 0,
    caseload: Array.from(counselorMap.values()).sort(
      (a, b) => b.count - a.count
    ),
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function getFirmSettings() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = getDb();

  const [firmResult, settingsResult, membersResult] = await Promise.all([
    db.from("firms").select("*").eq("id", ctx.firmId).single(),
    db.from("firm_settings").select("*").eq("firm_id", ctx.firmId).single(),
    db
      .from("firm_memberships")
      .select(
        "id, role, status, joined_at, users:user_id(id, first_name, last_name, email)"
      )
      .eq("firm_id", ctx.firmId)
      .order("joined_at", { ascending: true }),
  ]);

  return {
    firm: firmResult.data,
    settings: settingsResult.data,
    role: ctx.role,
    members: (membersResult.data ?? []).map((m) => {
      const user = (m as Record<string, unknown>).users as {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
      };
      return {
        id: m.id,
        role: m.role,
        status: m.status,
        joined_at: m.joined_at,
        user_id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Essay Drafts
// ---------------------------------------------------------------------------
export async function getEssayDrafts(filters?: {
  search?: string;
  status?: string;
  essay_type?: string;
  student_id?: string;
}) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  const db = getDb();
  let query = db
    .from("essay_drafts")
    .select(
      `id, title, essay_type, status, prompt_text, body, word_count_target,
       current_version_number, visibility_scope, created_at, updated_at,
       students(id, first_name, last_name),
       creator:created_by_user_id(first_name, last_name)`
    )
    .eq("firm_id", ctx.firmId)
    .order("updated_at", { ascending: false });

  if (scopedIds !== null) {
    query = query.in("student_id", scopedIds);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.essay_type) {
    query = query.eq("essay_type", filters.essay_type);
  }
  if (filters?.student_id) {
    query = query.eq("student_id", filters.student_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch essay drafts:", error);
    return [];
  }

  let results = (data ?? []).map((d) => {
    const student = (d as Record<string, unknown>).students as
      | { id: string; first_name: string; last_name: string }
      | undefined;
    const creator = (d as Record<string, unknown>).creator as
      | { first_name: string; last_name: string }
      | undefined;
    const body = (d.body as string) ?? "";
    const wordCount = body
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    return {
      id: d.id,
      title: d.title ?? "Untitled",
      essay_type: d.essay_type,
      status: d.status,
      prompt_text: d.prompt_text,
      word_count: wordCount,
      word_count_target: d.word_count_target as number | null,
      current_version_number: d.current_version_number,
      visibility_scope: d.visibility_scope,
      created_at: d.created_at,
      updated_at: d.updated_at,
      student_id: student?.id ?? "",
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown",
      created_by: creator
        ? `${creator.first_name} ${creator.last_name}`
        : "Unknown",
    };
  });

  if (filters?.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (d) =>
        d.title.toLowerCase().includes(term) ||
        d.student_name.toLowerCase().includes(term) ||
        d.essay_type.toLowerCase().includes(term)
    );
  }

  return results;
}

export async function getEssayDraftById(id: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = getDb();

  const { data: draft } = await db
    .from("essay_drafts")
    .select(
      `*,
       students(id, first_name, last_name),
       creator:created_by_user_id(first_name, last_name)`
    )
    .eq("id", id)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!draft) return null;

  const { data: versions } = await db
    .from("essay_draft_versions")
    .select(
      `id, version_number, body, commentary, created_at,
       author:created_by_user_id(first_name, last_name)`
    )
    .eq("essay_draft_id", id)
    .order("version_number", { ascending: false });

  // Latest AI suggestion per kind (brainstorm / outline / coach_review)
  const { data: aiSuggestions } = await db
    .from("essay_ai_suggestions")
    .select("id, kind, content, created_at")
    .eq("essay_draft_id", id)
    .order("created_at", { ascending: false });

  const latestByKind = new Map<string, { id: string; content: unknown; created_at: string }>();
  for (const row of aiSuggestions ?? []) {
    if (!latestByKind.has(row.kind as string)) {
      latestByKind.set(row.kind as string, {
        id: row.id,
        content: row.content,
        created_at: row.created_at,
      });
    }
  }

  const student = (draft as Record<string, unknown>).students as
    | { id: string; first_name: string; last_name: string }
    | undefined;
  const creator = (draft as Record<string, unknown>).creator as
    | { first_name: string; last_name: string }
    | undefined;

  const body = (draft.body as string) ?? "";
  const wordCount = body
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  return {
    id: draft.id,
    title: draft.title ?? "Untitled",
    essay_type: draft.essay_type,
    status: draft.status,
    student_college_id: draft.student_college_id ?? null,
    prompt_text: draft.prompt_text,
    body: draft.body ?? "",
    word_count: wordCount,
    word_count_target: draft.word_count_target as number | null,
    current_version_number: draft.current_version_number,
    visibility_scope: draft.visibility_scope,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
    student_id: student?.id ?? "",
    student_name: student
      ? `${student.first_name} ${student.last_name}`
      : "Unknown",
    created_by: creator
      ? `${creator.first_name} ${creator.last_name}`
      : "Unknown",
    current_user_id: ctx.dbUserId,
    // These columns hold structured JSON we wrote via the AI actions
    // (validated against Zod schemas before insert). Cast through unknown to
    // hand them back at the action-layer types without re-validating here.
    prompt_analysis: draft.prompt_analysis as unknown as
      | import("@/lib/ai/schemas").PromptAnalysis
      | null,
    prompt_analysis_at: draft.prompt_analysis_at as string | null,
    prompt_type: draft.prompt_type as string | null,
    word_count_limit: draft.word_count_limit as number | null,
    latest_brainstorm: (latestByKind.get("brainstorm") ?? null) as
      | { id: string; content: import("@/lib/ai/schemas").BrainstormResult; created_at: string }
      | null,
    latest_outline: (latestByKind.get("outline") ?? null) as
      | { id: string; content: import("@/lib/ai/schemas").OutlineResult; created_at: string }
      | null,
    latest_coach_review: (latestByKind.get("coach_review") ?? null) as
      | { id: string; content: import("@/lib/ai/schemas").CoachReviewResult; created_at: string }
      | null,
    versions: (versions ?? []).map((v) => {
      const author = (v as Record<string, unknown>).author as
        | { first_name: string; last_name: string }
        | undefined;
      return {
        id: v.id,
        version_number: v.version_number,
        body: v.body ?? "",
        commentary: v.commentary,
        created_at: v.created_at,
        author_name: author
          ? `${author.first_name} ${author.last_name}`
          : "Unknown",
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Workflow templates
// ---------------------------------------------------------------------------

export interface WorkflowTemplateRow {
  id: string;
  firm_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  workflow_type: string;
  grade_level: string | null;
  instantiation_scope: string;
  is_system_template: boolean;
  is_active: boolean;
  is_default: boolean;
  step_count: number;
  active_workflow_count: number;
}

export async function getWorkflowTemplates(filters?: {
  category?: string;
  activeOnly?: boolean;
}): Promise<WorkflowTemplateRow[]> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = getDb();
  let query = db
    .from("workflow_templates")
    .select(
      "id, firm_id, name, description, category, workflow_type, grade_level, instantiation_scope, is_system_template, is_active, is_default, workflow_template_steps(id), student_workflows(id, status)",
    )
    .or(`firm_id.eq.${ctx.firmId},is_system_template.eq.true`);

  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.activeOnly) query = query.eq("is_active", true);

  const { data } = await query
    .order("grade_level", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  return (data ?? []).map((row) => {
    const steps = (row.workflow_template_steps ?? []) as { id: string }[];
    const instances = (row.student_workflows ?? []) as { status: string }[];
    return {
      id: row.id,
      firm_id: row.firm_id,
      name: row.name,
      description: row.description,
      category: row.category,
      workflow_type: row.workflow_type,
      grade_level: row.grade_level,
      instantiation_scope: row.instantiation_scope ?? "student",
      is_system_template: row.is_system_template,
      is_active: row.is_active,
      is_default: row.is_default,
      step_count: steps.length,
      active_workflow_count: instances.filter(
        (i) => i.status === "in_progress" || i.status === "not_started",
      ).length,
    };
  });
}

export interface WorkflowTemplateStepRow {
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
  visibility_scope: string;
}

export interface WorkflowTemplateDetail extends WorkflowTemplateRow {
  steps: WorkflowTemplateStepRow[];
  is_editable: boolean;
}

export async function getWorkflowTemplateWithSteps(
  templateId: string,
): Promise<WorkflowTemplateDetail | null> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = getDb();
  const { data } = await db
    .from("workflow_templates")
    .select(
      "*, workflow_template_steps(*), student_workflows(id, status)",
    )
    .eq("id", templateId)
    .single();

  if (!data) return null;

  const accessible = data.is_system_template || data.firm_id === ctx.firmId;
  if (!accessible) return null;

  const steps = ((data.workflow_template_steps ?? []) as WorkflowTemplateStepRow[])
    .slice()
    .sort((a, b) => a.step_order - b.step_order);
  const instances = (data.student_workflows ?? []) as { status: string }[];

  return {
    id: data.id,
    firm_id: data.firm_id,
    name: data.name,
    description: data.description,
    category: data.category,
    workflow_type: data.workflow_type,
    grade_level: data.grade_level,
    instantiation_scope: data.instantiation_scope ?? "student",
    is_system_template: data.is_system_template,
    is_active: data.is_active,
    is_default: data.is_default,
    step_count: steps.length,
    active_workflow_count: instances.filter(
      (i) => i.status === "in_progress" || i.status === "not_started",
    ).length,
    steps,
    is_editable: !data.is_system_template && data.firm_id === ctx.firmId,
  };
}

/** Per-college templates available to apply from a student's college list. */
export async function getPerCollegeWorkflowTemplates(): Promise<
  Array<{ id: string; name: string; description: string | null; step_count: number }>
> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = getDb();
  const { data } = await db
    .from("workflow_templates")
    .select("id, name, description, workflow_template_steps(id)")
    .or(`firm_id.eq.${ctx.firmId},is_system_template.eq.true`)
    .eq("instantiation_scope", "student_college")
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    step_count: (row.workflow_template_steps ?? []).length,
  }));
}

// ---------------------------------------------------------------------------
// Workflow progress (staff + portal views)
// ---------------------------------------------------------------------------

export interface WorkflowStepProgress {
  id: string;
  title: string;
  description: string | null;
  status: string;
  step_order: number;
  due_date: string | null;
  depends_on_step_id: string | null;
  visibility_scope: string;
  assignee_name: string | null;
}

export interface WorkflowProgress {
  id: string;
  name: string;
  description: string | null;
  status: string;
  due_date: string | null;
  template_name: string | null;
  total_steps: number;
  completed_steps: number;
  visible_steps: WorkflowStepProgress[];
}

type RawWorkflowRow = {
  id: string;
  name: string | null;
  description: string | null;
  status: string;
  due_date: string | null;
  workflow_template_id: string | null;
  // Supabase typegen returns relationship selects as arrays even for to-one
  // FKs; widen to accept either shape since shapeWorkflowRow normalizes.
  workflow_templates:
    | { name: string }
    | { name: string }[]
    | null;
  student_workflow_steps: Array<{
    id: string;
    title: string | null;
    description: string | null;
    status: string;
    step_order: number | null;
    due_date: string | null;
    assigned_user_id: string | null;
    assignee:
      | { first_name: string | null; last_name: string | null }
      | { first_name: string | null; last_name: string | null }[]
      | null;
    workflow_template_steps:
      | {
          name: string;
          description: string | null;
          step_order: number;
          depends_on_step_id: string | null;
          visibility_scope: string;
        }
      | {
          name: string;
          description: string | null;
          step_order: number;
          depends_on_step_id: string | null;
          visibility_scope: string;
        }[]
      | null;
  }>;
};

function shapeWorkflowRow(
  raw: RawWorkflowRow,
  allowedScopes: string[],
): WorkflowProgress {
  const templateMeta = Array.isArray(raw.workflow_templates)
    ? raw.workflow_templates[0]
    : raw.workflow_templates;

  const allSteps = raw.student_workflow_steps ?? [];
  const completedSteps = allSteps.filter(
    (s) => s.status === "completed" || s.status === "skipped",
  ).length;

  const visibleSteps: WorkflowStepProgress[] = allSteps
    .map((s) => {
      const tmpl = Array.isArray(s.workflow_template_steps)
        ? s.workflow_template_steps[0] ?? null
        : s.workflow_template_steps;
      const assignee = Array.isArray(s.assignee) ? s.assignee[0] : s.assignee;
      const assigneeName = assignee
        ? `${assignee.first_name ?? ""} ${assignee.last_name ?? ""}`.trim() ||
          null
        : null;
      return {
        id: s.id,
        title: s.title ?? tmpl?.name ?? "Step",
        description: s.description ?? tmpl?.description ?? null,
        status: s.status,
        step_order: s.step_order ?? tmpl?.step_order ?? 0,
        due_date: s.due_date,
        depends_on_step_id: tmpl?.depends_on_step_id ?? null,
        visibility_scope: tmpl?.visibility_scope ?? "staff",
        assignee_name: assigneeName,
      };
    })
    .filter((s) => allowedScopes.includes(s.visibility_scope))
    .sort((a, b) => a.step_order - b.step_order);

  return {
    id: raw.id,
    name: raw.name ?? templateMeta?.name ?? "Workflow",
    description: raw.description,
    status: raw.status,
    due_date: raw.due_date,
    template_name: templateMeta?.name ?? null,
    total_steps: allSteps.length,
    completed_steps: completedSteps,
    visible_steps: visibleSteps,
  };
}

const WORKFLOW_SELECT = `
  id, name, description, status, due_date, workflow_template_id,
  workflow_templates(name),
  student_workflow_steps(
    id, title, description, status, step_order, due_date, assigned_user_id,
    assignee:users!student_workflow_steps_assigned_user_id_fkey(first_name, last_name),
    workflow_template_steps!inner(name, description, step_order, depends_on_step_id, visibility_scope)
  )
`;

/** Staff view: full step visibility for a single student. */
export async function getStudentWorkflows(
  studentId: string,
): Promise<WorkflowProgress[]> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = getDb();
  const { data } = await db
    .from("student_workflows")
    .select(WORKFLOW_SELECT)
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as RawWorkflowRow[]).map((row) =>
    shapeWorkflowRow(row, ["staff", "student", "family"]),
  );
}

/** Student portal: own workflows, only steps marked visible to student/family. */
export async function getMyWorkflows(): Promise<WorkflowProgress[]> {
  const resolved = await resolveStudentForPortal();
  if (!resolved) return [];

  const { ctx, studentId, db } = resolved;
  const { data } = await db
    .from("student_workflows")
    .select(WORKFLOW_SELECT)
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  return ((data ?? []) as RawWorkflowRow[]).map((row) =>
    shapeWorkflowRow(row, ["student", "family"]),
  );
}

/** Family portal: workflows for all children, family-visible steps only. */
export async function getFamilyWorkflows(): Promise<
  Array<{ student: { id: string; first_name: string; last_name: string }; workflows: WorkflowProgress[] }>
> {
  const resolved = await resolveParentForPortal();
  if (!resolved) return [];

  const { ctx, students, studentIds, db } = resolved;
  if (studentIds.length === 0) return [];

  const { data } = await db
    .from("student_workflows")
    .select(`student_id, ${WORKFLOW_SELECT}`)
    .eq("firm_id", ctx.firmId)
    .in("student_id", studentIds)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  const byStudent = new Map<string, WorkflowProgress[]>();
  for (const row of (data ?? []) as Array<RawWorkflowRow & { student_id: string }>) {
    const shaped = shapeWorkflowRow(row, ["family"]);
    if (shaped.visible_steps.length === 0) continue;
    const list = byStudent.get(row.student_id) ?? [];
    list.push(shaped);
    byStudent.set(row.student_id, list);
  }

  return students
    .filter((s) => byStudent.has(s.id))
    .map((s) => ({
      student: { id: s.id, first_name: s.first_name, last_name: s.last_name },
      workflows: byStudent.get(s.id) ?? [],
    }));
}

// ---------------------------------------------------------------------------
// Portal notes (Phase 3): counselor notes shared with the family
// ---------------------------------------------------------------------------
export async function getPortalNotesForStudent() {
  const resolved = await resolveStudentForPortal();
  if (!resolved) return [];
  const { ctx, studentId, db } = resolved;

  const { data } = await db
    .from("notes")
    .select("id, title, body, created_at")
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .in("visibility_scope", ["family", "firm"])
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  return data ?? [];
}

export async function getPortalNotesForFamily() {
  const resolved = await resolveParentForPortal();
  if (!resolved) return [];
  const { ctx, familyId, studentIds, db } = resolved;

  let query = db
    .from("notes")
    .select("id, title, body, created_at, student_id, students(first_name)")
    .eq("firm_id", ctx.firmId)
    .in("visibility_scope", ["family", "firm"])
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  if (studentIds.length > 0) {
    query = query.or(
      `family_id.eq.${familyId},student_id.in.(${studentIds.join(",")})`
    );
  } else {
    query = query.eq("family_id", familyId);
  }
  const { data } = await query;
  return data ?? [];
}

/** Parent portal: the caller's children as select options. */
export async function getParentStudentsForSelect() {
  const resolved = await resolveParentForPortal();
  if (!resolved) return [];
  return resolved.students.map((s) => ({
    id: s.id,
    name: `${s.first_name} ${s.last_name}`,
  }));
}

/** Parent portal: per-child financial profile for the family intake card. */
export async function getFamilyIntakeData() {
  const resolved = await resolveParentForPortal();
  if (!resolved) return [];
  const { ctx, studentIds, db } = resolved;
  if (studentIds.length === 0) return [];

  const { data: profiles } = await db
    .from("student_profiles")
    // Explicit list: counselor-private fields never reach the portal.
    .select(
      "student_id, budget_range, financial_aid_interest, financial_aid_needed, citizenship_status, intake_submitted_at"
    )
    .eq("firm_id", ctx.firmId)
    .in("student_id", studentIds);
  const byStudent = new Map(
    (profiles ?? []).map((p) => [p.student_id, p])
  );

  return resolved.students.map((s) => {
    const p = byStudent.get(s.id);
    return {
      studentId: s.id,
      name: `${s.first_name} ${s.last_name}`,
      intakeSubmittedAt: p?.intake_submitted_at ?? null,
      financial: {
        sat_score: null,
        act_score: null,
        geographic_preferences: null,
        target_school_type: null,
        financial_aid_needed: p?.financial_aid_needed ?? null,
        financial_aid_interest: p?.financial_aid_interest ?? null,
        budget_range: p?.budget_range ?? null,
        citizenship_status: p?.citizenship_status ?? null,
        testing_summary_json: null,
        activities_json: null,
        awards_json: null,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Application detail (Phase 5)
// ---------------------------------------------------------------------------
export async function getApplicationById(id: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = getDb();
  const { data: app } = await db
    .from("applications")
    .select(
      `id, application_type, stage, deadline_at, submitted_at, decision_at,
       decision_result, financial_aid_required, checklist_json,
       cost_of_attendance, student_college_id, student_id, college_id,
       students(id, first_name, last_name, graduation_year),
       colleges(id, name, city, state_region, application_platform,
                tuition_in_state, tuition_out_state, net_price_avg),
       student_colleges(id, category, round_type, intended_major, deposit_status),
       aid_awards(id, kind, name, annual_amount, renewable, notes)`
    )
    .eq("id", id)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!app) return null;

  // Scoped staff only see their assigned students' applications.
  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && !scopedIds.includes(app.student_id)) return null;

  const [essays, workflows] = await Promise.all([
    db
      .from("essay_drafts")
      .select(
        "id, title, essay_type, status, visibility_scope, current_version_number, updated_at"
      )
      .eq("firm_id", ctx.firmId)
      .or(
        `application_id.eq.${app.id},student_college_id.eq.${app.student_college_id}`
      )
      .order("updated_at", { ascending: false }),
    db
      .from("student_workflows")
      .select("id, name, status")
      .eq("firm_id", ctx.firmId)
      .eq("student_college_id", app.student_college_id)
      .limit(3),
  ]);

  // Essays not yet linked to any college, offered for linking on the page.
  const { data: unlinkedEssays } = await db
    .from("essay_drafts")
    .select("id, title, essay_type")
    .eq("firm_id", ctx.firmId)
    .eq("student_id", app.student_id)
    .is("student_college_id", null)
    .is("application_id", null)
    .order("updated_at", { ascending: false });

  return {
    ...app,
    essays: essays.data ?? [],
    supplementWorkflows: workflows.data ?? [],
    unlinkedEssays: unlinkedEssays ?? [],
  };
}

/** Student portal: one essay, own student only, portal-visible scopes only. */
export async function getStudentEssayById(id: string) {
  const resolved = await resolveStudentForPortal();
  if (!resolved) return null;
  const { ctx, studentId, db } = resolved;

  const { data } = await db
    .from("essay_drafts")
    .select(
      `id, title, essay_type, status, prompt_text, body, word_count_target,
       word_count_limit, current_version_number, visibility_scope, updated_at`
    )
    .eq("id", id)
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .in("visibility_scope", ["student", "family", "firm"])
    .maybeSingle();
  return data ?? null;
}

/** Recommendation-letter tracking rows for one student (staff view). */
export async function getRecommendersForStudent(studentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];
  const db = getDb();
  const { data } = await db
    .from("recommenders")
    .select("id, name, role_title, email, status, notes")
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Family progress view (Phase 6.4): the "where does everything stand" data
// ---------------------------------------------------------------------------
export async function getFamilyProgressData() {
  const resolved = await resolveParentForPortal();
  if (!resolved) return [];
  const { ctx, students, studentIds, db } = resolved;
  if (studentIds.length === 0) return [];

  const { data: apps } = await db
    .from("applications")
    .select(
      `id, student_id, application_type, stage, deadline_at, submitted_at,
       decision_result, checklist_json, colleges(name)`
    )
    .eq("firm_id", ctx.firmId)
    .in("student_id", studentIds)
    .order("deadline_at", { ascending: true, nullsFirst: false });

  const appsByStudent = new Map<string, Array<Record<string, unknown>>>();
  for (const app of apps ?? []) {
    const checklist = parseChecklist(app.checklist_json) ?? [];
    const college = (app as Record<string, unknown>).colleges as
      | { name: string }
      | { name: string }[]
      | null;
    const list = appsByStudent.get(app.student_id) ?? [];
    list.push({
      id: app.id,
      application_type: app.application_type,
      stage: app.stage,
      deadline_at: app.deadline_at,
      submitted_at: app.submitted_at,
      decision_result: app.decision_result,
      checklist_done: checklist.filter((c) => c.done).length,
      checklist_total: checklist.length,
      college_name: Array.isArray(college)
        ? (college[0]?.name ?? "College")
        : (college?.name ?? "College"),
    });
    appsByStudent.set(app.student_id, list);
  }

  return students.map((s) => ({
    student: { id: s.id, first_name: s.first_name, last_name: s.last_name },
    applications: appsByStudent.get(s.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Waiting-work signals (fix plan 8.2) + Today agenda (8.3)
// ---------------------------------------------------------------------------

/**
 * Unread-message count for the nav badge, in all three shells. Staff see the
 * firm inbox (matching /messages); portal roles see their participant
 * conversations. Bounded scan — the badge caps at 99 anyway.
 */
export async function getUnreadMessageCount(): Promise<number> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return 0;
  const db = getDb();

  let conversationIds: string[];
  if (isStaffRole(ctx.role)) {
    const { data } = await db
      .from("conversations")
      .select("id")
      .eq("firm_id", ctx.firmId)
      .order("updated_at", { ascending: false })
      .limit(100);
    conversationIds = (data ?? []).map((c) => c.id);
  } else {
    const { data } = await db
      .from("conversation_participants")
      .select("conversation_id, conversations!inner(firm_id)")
      .eq("user_id", ctx.dbUserId)
      .eq("conversations.firm_id", ctx.firmId)
      .limit(100);
    conversationIds = (data ?? []).map((c) => c.conversation_id);
  }
  if (conversationIds.length === 0) return 0;

  const { data: messages } = await db
    .from("messages")
    .select("id, message_reads(user_id)")
    .in("conversation_id", conversationIds)
    .neq("sender_user_id", ctx.dbUserId)
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(300);

  return (messages ?? []).filter(
    (m) =>
      !((m as { message_reads: { user_id: string }[] | null }).message_reads ??
        []).some((r) => r.user_id === ctx.dbUserId)
  ).length;
}

export interface AgendaItem {
  id: string;
  kind: "task" | "meeting" | "deadline";
  title: string;
  subtitle: string | null;
  href: string;
  at: string | null;
  overdue: boolean;
}

/**
 * The "Today" panel (fix plan 8.3): due/overdue tasks, today's meetings,
 * and application deadlines inside 7 days — as actionable linked items,
 * replacing the bare Due Today / Overdue counts as the morning screen.
 * Firm-scoped, matching the rest of the dashboard.
 */
export async function getTodayAgenda(): Promise<AgendaItem[]> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];
  const db = getDb();

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const [tasks, meetings, deadlines] = await Promise.all([
    db
      .from("tasks")
      .select("id, title, due_at, students(first_name, last_name)")
      .eq("firm_id", ctx.firmId)
      .in("status", ["pending", "in_progress"])
      .is("archived_at", null)
      .lte("due_at", endOfDay.toISOString())
      .order("due_at", { ascending: true })
      .limit(10),
    db
      .from("meetings")
      .select("id, title, scheduled_start_at")
      .eq("firm_id", ctx.firmId)
      .gte("scheduled_start_at", new Date(now).toISOString())
      .lte("scheduled_start_at", endOfDay.toISOString())
      .order("scheduled_start_at", { ascending: true })
      .limit(10),
    db
      .from("applications")
      .select(
        "id, deadline_at, application_type, colleges(name), students(first_name, last_name)"
      )
      .eq("firm_id", ctx.firmId)
      .not("stage", "in", "(submitted,under_review,decision_received,withdrawn)")
      .gte("deadline_at", now.toISOString())
      .lte("deadline_at", in7Days.toISOString())
      .order("deadline_at", { ascending: true })
      .limit(10),
  ]);

  const items: AgendaItem[] = [];
  type Name = { first_name: string; last_name: string } | null;
  const nameOf = (v: Name | Name[] | null) => {
    const n = Array.isArray(v) ? v[0] : v;
    return n ? `${n.first_name} ${n.last_name}` : null;
  };

  for (const t of tasks.data ?? []) {
    items.push({
      id: t.id,
      kind: "task",
      title: t.title,
      subtitle: nameOf(t.students as Name | Name[] | null),
      href: "/tasks",
      at: t.due_at,
      overdue: !!t.due_at && new Date(t.due_at) < now,
    });
  }
  for (const m of meetings.data ?? []) {
    items.push({
      id: m.id,
      kind: "meeting",
      title: m.title,
      subtitle: null,
      href: "/calendar",
      at: m.scheduled_start_at,
      overdue: false,
    });
  }
  for (const a of deadlines.data ?? []) {
    const college = Array.isArray(a.colleges) ? a.colleges[0] : a.colleges;
    items.push({
      id: a.id,
      kind: "deadline",
      title: `${(college as { name: string } | null)?.name ?? "Application"} due`,
      subtitle: nameOf(a.students as Name | Name[] | null),
      href: `/applications/${a.id}`,
      at: a.deadline_at,
      overdue: false,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// White-labeling (fix plan 9.2)
// ---------------------------------------------------------------------------

export interface FirmBranding {
  firmName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
}

/** Firm branding for the shells: configured in Settings since Phase 0,
 * rendered since Phase 9. */
export async function getFirmBranding(): Promise<FirmBranding> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { firmName: null, logoUrl: null, primaryColor: null };
  const db = getDb();
  const [{ data: settings }, { data: firm }] = await Promise.all([
    db
      .from("firm_settings")
      .select("branding_logo_url, primary_color")
      .eq("firm_id", ctx.firmId)
      .maybeSingle(),
    db.from("firms").select("name").eq("id", ctx.firmId).maybeSingle(),
  ]);
  return {
    firmName: firm?.name ?? null,
    logoUrl: settings?.branding_logo_url ?? null,
    primaryColor: settings?.primary_color ?? null,
  };
}

// ---------------------------------------------------------------------------
// Service agreements (fix plan 10.1)
// ---------------------------------------------------------------------------

export async function getAgreementTemplates() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];
  const db = getDb();
  const { data } = await db
    .from("agreement_templates")
    .select("id, name, body, is_active, updated_at")
    .eq("firm_id", ctx.firmId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export interface AgreementSummary {
  id: string;
  title: string;
  status: string;
  sent_at: string;
  completed_at: string | null;
  signed_document_id: string | null;
  signed_roles: string[];
}

export async function getFamilyAgreements(
  familyId: string
): Promise<AgreementSummary[]> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];
  const db = getDb();
  const { data } = await db
    .from("service_agreements")
    .select(
      "id, title, status, sent_at, completed_at, signed_document_id, agreement_signatures(signer_role)"
    )
    .eq("firm_id", ctx.firmId)
    .eq("family_id", familyId)
    .order("sent_at", { ascending: false });
  return (data ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    sent_at: a.sent_at,
    completed_at: a.completed_at,
    signed_document_id: a.signed_document_id,
    signed_roles: (
      (a as { agreement_signatures?: { signer_role: string }[] })
        .agreement_signatures ?? []
    ).map((s) => s.signer_role),
  }));
}

/** Parent portal: agreements for the caller's families. */
export async function getPortalAgreements(): Promise<AgreementSummary[]> {
  const ctx = await resolveUserAndFirm();
  if (!ctx || ctx.role !== "parent_guardian") return [];
  const db = getDb();
  const { data: memberships } = await db
    .from("family_members")
    .select("family_id")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId);
  const familyIds = (memberships ?? []).map((m) => m.family_id);
  if (familyIds.length === 0) return [];

  const { data } = await db
    .from("service_agreements")
    .select(
      "id, title, status, sent_at, completed_at, signed_document_id, agreement_signatures(signer_role)"
    )
    .eq("firm_id", ctx.firmId)
    .in("family_id", familyIds)
    .neq("status", "voided")
    .order("sent_at", { ascending: false });
  return (data ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    sent_at: a.sent_at,
    completed_at: a.completed_at,
    signed_document_id: a.signed_document_id,
    signed_roles: (
      (a as { agreement_signatures?: { signer_role: string }[] })
        .agreement_signatures ?? []
    ).map((s) => s.signer_role),
  }));
}

/** Full agreement for the portal signing page — participants only. */
export async function getPortalAgreementById(agreementId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx || ctx.role !== "parent_guardian") return null;
  const db = getDb();
  const { data: agreement } = await db
    .from("service_agreements")
    .select(
      "id, family_id, title, status, body_snapshot, document_hash, sent_at, completed_at, agreement_signatures(signer_role, signed_name, signed_at)"
    )
    .eq("id", agreementId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!agreement) return null;

  const { data: membership } = await db
    .from("family_members")
    .select("id")
    .eq("firm_id", ctx.firmId)
    .eq("family_id", agreement.family_id)
    .eq("user_id", ctx.dbUserId)
    .maybeSingle();
  if (!membership) return null;
  return agreement;
}

/**
 * Portal-invitation gate (fix plan 10.1): when the firm requires a signed
 * agreement, invitations stay blocked until this family has a completed one.
 */
export async function familyAgreementGate(
  db: SupabaseClient,
  firmId: string,
  familyId: string
): Promise<{ blocked: boolean }> {
  const { data: settings } = await db
    .from("firm_settings")
    .select("require_signed_agreement")
    .eq("firm_id", firmId)
    .maybeSingle();
  if (!settings?.require_signed_agreement) return { blocked: false };

  const { data: completed } = await db
    .from("service_agreements")
    .select("id")
    .eq("firm_id", firmId)
    .eq("family_id", familyId)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();
  return { blocked: !completed };
}

// ---------------------------------------------------------------------------
// Family progress report deliverable (fix plan 10.2)
// ---------------------------------------------------------------------------

/**
 * Point-in-time per-student progress report data. Family-safe content only
 * (it is the family deliverable): identity, workflow progress, applications
 * with checklist completion and decisions, and upcoming family-visible
 * meetings. Accessible to staff with access to the student AND to the
 * student/parents themselves.
 */
export async function getStudentProgressReportData(studentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;
  const db = getDb();

  // Staff: assignment-scoped. Portal roles: only their own student(s).
  if (isStaffRole(ctx.role)) {
    const scopedIds = await getAssignedStudentIds(ctx);
    if (scopedIds !== null && !scopedIds.includes(studentId)) return null;
  } else {
    const relationship = await resolveStudentRelationship(db, ctx, studentId);
    if (relationship !== "own_student" && relationship !== "family_parent") {
      return null;
    }
  }

  const [studentRes, firmRes, appsRes, workflowsRes, meetingsRes, tasksRes] =
    await Promise.all([
      db
        .from("students")
        .select("id, first_name, last_name, graduation_year, school_name")
        .eq("id", studentId)
        .eq("firm_id", ctx.firmId)
        .maybeSingle(),
      db.from("firms").select("name").eq("id", ctx.firmId).maybeSingle(),
      db
        .from("applications")
        .select(
          "id, application_type, stage, deadline_at, submitted_at, decision_result, decision_at, checklist_json, colleges(name)"
        )
        .eq("firm_id", ctx.firmId)
        .eq("student_id", studentId)
        .order("deadline_at", { ascending: true, nullsFirst: false }),
      db
        .from("student_workflows")
        .select(
          "id, name, status, student_workflow_steps(id, status, visibility_scope)"
        )
        .eq("firm_id", ctx.firmId)
        .eq("student_id", studentId)
        .neq("status", "cancelled"),
      db
        .from("meetings")
        .select("id, title, scheduled_start_at, location_text")
        .eq("firm_id", ctx.firmId)
        .eq("student_id", studentId)
        .in("visibility_scope", ["student", "family", "firm"])
        .gte("scheduled_start_at", new Date().toISOString())
        .order("scheduled_start_at", { ascending: true })
        .limit(5),
      db
        .from("tasks")
        .select("id, title, due_at, status")
        .eq("firm_id", ctx.firmId)
        .eq("student_id", studentId)
        .in("visibility_scope", ["student", "family", "firm"])
        .in("status", ["pending", "in_progress"])
        .is("archived_at", null)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(10),
    ]);

  if (!studentRes.data) return null;

  return {
    student: studentRes.data,
    firmName: firmRes.data?.name ?? "CounselWorks",
    generatedAt: new Date().toISOString(),
    applications: (appsRes.data ?? []).map((a) => {
      const checklist = parseChecklist(a.checklist_json) ?? [];
      const college = Array.isArray(a.colleges) ? a.colleges[0] : a.colleges;
      return {
        id: a.id,
        college_name:
          (college as { name: string } | null)?.name ?? "Unknown college",
        application_type: a.application_type,
        stage: a.stage,
        deadline_at: a.deadline_at,
        submitted_at: a.submitted_at,
        decision_result: a.decision_result,
        decision_at: a.decision_at,
        checklist_done: checklist.filter((c) => c.done).length,
        checklist_total: checklist.length,
      };
    }),
    workflows: (workflowsRes.data ?? []).map((w) => {
      const steps = (
        (w as {
          student_workflow_steps?: { status: string; visibility_scope: string }[];
        }).student_workflow_steps ?? []
      ).filter((s) => s.visibility_scope !== "staff");
      return {
        id: w.id,
        name: w.name,
        status: w.status,
        total: steps.length,
        completed: steps.filter(
          (s) => s.status === "completed" || s.status === "skipped"
        ).length,
      };
    }),
    meetings: meetingsRes.data ?? [],
    tasks: tasksRes.data ?? [],
  };
}

/**
 * Reports scoping + decision roster (fix plan 10.2): "where everyone
 * stands" — one row per decision-received application, filterable by class
 * year and counselor.
 */
export interface DecisionRosterRow {
  student_id: string;
  student_name: string;
  graduation_year: number;
  college_name: string;
  application_type: string;
  decision_result: string;
  decision_at: string | null;
  deposit_status: string | null;
}

export async function getDecisionRoster(filters?: {
  classYear?: string;
  counselorId?: string;
}): Promise<DecisionRosterRow[]> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];
  const db = getDb();

  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return [];

  let counselorStudentIds: string[] | null = null;
  if (filters?.counselorId) {
    const { data } = await db
      .from("student_staff_assignments")
      .select("student_id")
      .eq("firm_id", ctx.firmId)
      .eq("user_id", filters.counselorId);
    counselorStudentIds = (data ?? []).map((r) => r.student_id);
    if (counselorStudentIds.length === 0) return [];
  }

  let query = db
    .from("applications")
    .select(
      `id, application_type, decision_result, decision_at,
       students!inner(id, first_name, last_name, graduation_year),
       colleges(name),
       student_colleges(deposit_status)`
    )
    .eq("firm_id", ctx.firmId)
    .not("decision_result", "is", null)
    .order("decision_at", { ascending: false });
  if (scopedIds !== null) query = query.in("student_id", scopedIds);
  if (counselorStudentIds !== null) {
    query = query.in("student_id", counselorStudentIds);
  }
  if (filters?.classYear) {
    query = query.eq("students.graduation_year", parseInt(filters.classYear));
  }

  const { data } = await query;
  return (data ?? []).map((a) => {
    const student = (Array.isArray(a.students) ? a.students[0] : a.students) as {
      id: string;
      first_name: string;
      last_name: string;
      graduation_year: number;
    };
    const college = (Array.isArray(a.colleges) ? a.colleges[0] : a.colleges) as {
      name: string;
    } | null;
    const sc = (Array.isArray(a.student_colleges)
      ? a.student_colleges[0]
      : a.student_colleges) as { deposit_status: string | null } | null;
    return {
      student_id: student.id,
      student_name: `${student.first_name} ${student.last_name}`,
      graduation_year: student.graduation_year,
      college_name: college?.name ?? "Unknown",
      application_type: a.application_type,
      decision_result: a.decision_result as string,
      decision_at: a.decision_at,
      deposit_status: sc?.deposit_status ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Essay coaching feedback + prompt bank (fix plan 10.3)
// ---------------------------------------------------------------------------

export interface EssayFeedbackRow {
  id: string;
  version_number: number;
  body: string;
  quoted_text: string | null;
  resolved_at: string | null;
  created_at: string;
  author_name: string;
  author_is_staff: boolean;
}

/** Feedback thread for an essay; callers gate essay access first. */
export async function getEssayFeedback(
  essayId: string
): Promise<EssayFeedbackRow[]> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];
  const db = getDb();
  const { data } = await db
    .from("essay_feedback")
    .select(
      "id, version_number, body, quoted_text, resolved_at, created_at, users:author_user_id(first_name, last_name), author_user_id"
    )
    .eq("firm_id", ctx.firmId)
    .eq("essay_draft_id", essayId)
    .order("created_at", { ascending: true });

  // Author staffness: batch-resolve the authors' roles for labeling.
  const authorIds = [...new Set((data ?? []).map((f) => f.author_user_id))];
  const staffAuthors = new Set<string>();
  if (authorIds.length > 0) {
    const { data: memberships } = await db
      .from("firm_memberships")
      .select("user_id, role")
      .eq("firm_id", ctx.firmId)
      .in("user_id", authorIds);
    for (const m of memberships ?? []) {
      if (isStaffRole(m.role)) staffAuthors.add(m.user_id);
    }
  }

  return (data ?? []).map((f) => {
    const user = (Array.isArray(f.users) ? f.users[0] : f.users) as {
      first_name: string;
      last_name: string;
    } | null;
    return {
      id: f.id,
      version_number: f.version_number,
      body: f.body,
      quoted_text: f.quoted_text,
      resolved_at: f.resolved_at,
      created_at: f.created_at,
      author_name: user ? `${user.first_name} ${user.last_name}` : "Unknown",
      author_is_staff: staffAuthors.has(f.author_user_id),
    };
  });
}

export interface EssayPromptRow {
  id: string;
  title: string;
  prompt_text: string;
  word_limit: number | null;
  college_id: string | null;
  college_name: string | null;
}

export async function getEssayPrompts(): Promise<EssayPromptRow[]> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];
  const db = getDb();
  const { data } = await db
    .from("essay_prompts")
    .select("id, title, prompt_text, word_limit, college_id, colleges(name)")
    .eq("firm_id", ctx.firmId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  return (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    prompt_text: p.prompt_text,
    word_limit: p.word_limit,
    college_id: p.college_id,
    college_name:
      ((Array.isArray(p.colleges) ? p.colleges[0] : p.colleges) as {
        name: string;
      } | null)?.name ?? null,
  }));
}
