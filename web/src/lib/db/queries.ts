import { createServerClient } from "./client";
import { resolveUserAndFirm } from "../auth/resolve";

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------
export async function getDashboardStats() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = createServerClient();

  const [students, tasks, applications, meetings] = await Promise.all([
    db
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", ctx.firmId)
      .eq("status", "active"),
    db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", ctx.firmId)
      .in("status", ["pending", "in_progress"])
      .lt("due_at", new Date().toISOString()),
    db
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", ctx.firmId)
      .not("stage", "in", "(decision_received,withdrawn)"),
    db
      .from("meetings")
      .select("id, title, scheduled_start_at, student_id")
      .eq("firm_id", ctx.firmId)
      .gte("scheduled_start_at", new Date().toISOString())
      .order("scheduled_start_at", { ascending: true })
      .limit(5),
  ]);

  // Upcoming deadlines (tasks + applications due in next 30 days)
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);

  const { count: deadlineCount } = await db
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("firm_id", ctx.firmId)
    .in("status", ["pending", "in_progress"])
    .gte("due_at", new Date().toISOString())
    .lte("due_at", thirtyDays.toISOString());

  return {
    activeStudents: students.count ?? 0,
    overdueTasks: tasks.count ?? 0,
    activeApplications: applications.count ?? 0,
    upcomingDeadlines: deadlineCount ?? 0,
    upcomingMeetings: meetings.data ?? [],
  };
}

// ---------------------------------------------------------------------------
// Student portal: dashboard data for the logged-in student
// ---------------------------------------------------------------------------

export async function getStudentPortalData() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = createServerClient();

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
        .select("id, title, scheduled_start_at")
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

  const db = createServerClient();
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
       current_version_number, visibility_scope, created_at, updated_at`
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

  const { ctx, studentId, db } = resolved;
  const { data, error } = await db
    .from("conversations")
    .select(
      `id, conversation_type, visibility_scope, created_at, updated_at,
       conversation_participants(
         user_id,
         users:user_id(first_name, last_name)
       ),
       messages(id, body, sent_at, sender_user_id,
         sender:sender_user_id(first_name, last_name)
       )`
    )
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
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
        sender: { first_name: string; last_name: string };
      }>
    ) ?? [];

    const lastMessage = messages.length > 0
      ? messages.reduce((latest, m) =>
          m.sent_at > latest.sent_at ? m : latest
        )
      : null;

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
    };
  });
}

// ---------------------------------------------------------------------------
// Family (parent) portal queries
// ---------------------------------------------------------------------------

async function resolveParentForPortal() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = createServerClient();

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
        .select("id, title, scheduled_start_at, student_id, students(first_name)")
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

  const { ctx, familyId, studentIds, db } = resolved;

  let query = db
    .from("conversations")
    .select(
      `id, conversation_type, visibility_scope, created_at, updated_at,
       student_id, students(first_name),
       conversation_participants(
         user_id,
         users:user_id(first_name, last_name)
       ),
       messages(id, body, sent_at, sender_user_id,
         sender:sender_user_id(first_name, last_name)
       )`
    )
    .eq("firm_id", ctx.firmId)
    .in("visibility_scope", ["family", "firm"])
    .order("updated_at", { ascending: false });

  if (studentIds.length > 0) {
    query = query.or(
      `family_id.eq.${familyId},student_id.in.(${studentIds.join(",")})`
    );
  } else {
    query = query.eq("family_id", familyId);
  }

  const { data, error } = await query;
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
        sender: { first_name: string; last_name: string };
      }>
    ) ?? [];

    const lastMessage = messages.length > 0
      ? messages.reduce((latest, m) =>
          m.sent_at > latest.sent_at ? m : latest
        )
      : null;

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
      .select(
        "testing_summary_json, awards_json, activities_json, budget_range, financial_aid_interest"
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

  const db = createServerClient();
  const { data } = await db
    .from("audit_events")
    .select("id, entity_type, action_type, metadata_json, created_at")
    .eq("firm_id", ctx.firmId)
    .order("created_at", { ascending: false })
    .limit(10);

  return data ?? [];
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------
export async function getStudents(filters?: {
  search?: string;
  status?: string;
  graduationYear?: string;
}) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = createServerClient();
  let query = db
    .from("students")
    .select(
      `id, first_name, last_name, graduation_year, school_name, status,
       student_staff_assignments!inner(user_id, assignment_type, is_primary,
         users:user_id(first_name, last_name)
       )`
    )
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null)
    .order("last_name", { ascending: true });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.graduationYear) {
    query = query.eq("graduation_year", parseInt(filters.graduationYear));
  }
  if (filters?.search) {
    query = query.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    // Retry without join in case there are no assignments yet
    const { data: fallback } = await db
      .from("students")
      .select("id, first_name, last_name, graduation_year, school_name, status")
      .eq("firm_id", ctx.firmId)
      .is("archived_at", null)
      .order("last_name", { ascending: true });

    return (fallback ?? []).map((s) => ({ ...s, counselor_name: null }));
  }

  return (data ?? []).map((s) => {
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
}

export async function getStudentById(id: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = createServerClient();
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
      .select("id, title, body, created_at, note_type")
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

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------
export async function getApplications(filters?: {
  search?: string;
  stage?: string;
}) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = createServerClient();
  let query = db
    .from("applications")
    .select(
      `id, stage, application_type, deadline_at, submitted_at, decision_result,
       students(id, first_name, last_name),
       colleges(id, name, slug)`
    )
    .eq("firm_id", ctx.firmId)
    .order("deadline_at", { ascending: true, nullsFirst: false });

  if (filters?.stage) {
    query = query.eq("stage", filters.stage);
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
    return {
      id: a.id,
      stage: a.stage,
      application_type: a.application_type,
      deadline_at: a.deadline_at,
      submitted_at: a.submitted_at,
      decision_result: a.decision_result,
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

  const db = createServerClient();
  const { data } = await db
    .from("students")
    .select("id, first_name, last_name")
    .eq("firm_id", ctx.firmId)
    .eq("status", "active")
    .is("archived_at", null)
    .order("last_name", { ascending: true });

  return (data ?? []).map((s) => ({
    id: s.id,
    name: `${s.first_name} ${s.last_name}`,
  }));
}

export async function getCollegesForSelect() {
  const db = createServerClient();
  const { data } = await db
    .from("colleges")
    .select("id, name")
    .order("name", { ascending: true });

  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
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

  const db = createServerClient();
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
  const db = createServerClient();
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
  const db = createServerClient();

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
  const db = createServerClient();
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

  const db = createServerClient();
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

  const db = createServerClient();

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

  // Score each college based on student profile
  const scored = allColleges
    .filter((c) => !existingIds.has(c.id))
    .map((college) => {
      let score = 0;
      let factors: string[] = [];

      // Test score match (SAT)
      const studentSAT = profile?.sat_score as number | null;
      const collegeSAT = college.sat_avg as number | null;
      if (studentSAT && collegeSAT) {
        const diff = Math.abs(studentSAT - collegeSAT);
        if (diff <= 50) { score += 30; factors.push("SAT score is an excellent match"); }
        else if (diff <= 100) { score += 20; factors.push("SAT score is a good match"); }
        else if (diff <= 150) { score += 10; factors.push("SAT score is within range"); }
        else if (studentSAT > collegeSAT + 100) { score += 5; factors.push("SAT score exceeds average"); }
      }

      // Test score match (ACT)
      const studentACT = profile?.act_score as number | null;
      const collegeACT = college.act_avg as number | null;
      if (studentACT && collegeACT) {
        const diff = Math.abs(studentACT - collegeACT);
        if (diff <= 1) { score += 30; factors.push("ACT score is an excellent match"); }
        else if (diff <= 3) { score += 20; factors.push("ACT score is a good match"); }
        else if (diff <= 5) { score += 10; factors.push("ACT score is within range"); }
        else if (studentACT > collegeACT + 3) { score += 5; factors.push("ACT score exceeds average"); }
      }

      // Geographic preference match
      const geoPrefs = (profile?.geographic_preferences ?? []) as string[];
      if (geoPrefs.length > 0 && college.state_region) {
        if (geoPrefs.some((p: string) => p.toLowerCase() === (college.state_region as string).toLowerCase())) {
          score += 15;
          factors.push("Matches geographic preference");
        }
      }

      // Financial aid
      const needsAid = profile?.financial_aid_needed as boolean | null;
      if (needsAid && college.net_price_avg) {
        if ((college.net_price_avg as number) < 20000) {
          score += 10;
          factors.push("Affordable net price");
        } else if ((college.net_price_avg as number) < 30000) {
          score += 5;
          factors.push("Moderate net price");
        }
      }

      // School type preference
      const targetType = profile?.target_school_type as string | null;
      if (targetType && college.institution_type) {
        if ((college.institution_type as string).toLowerCase().includes(targetType.toLowerCase())) {
          score += 10;
          factors.push("Matches preferred school type");
        }
      }

      // Graduation rate bonus
      if (college.graduation_rate && (college.graduation_rate as number) > 0.8) {
        score += 5;
        factors.push("High graduation rate");
      }

      // Ranking bonus
      const rank = college.usnews_national_rank ?? college.usnews_liberal_arts_rank;
      if (rank) {
        if ((rank as number) <= 25) { score += 10; factors.push("Top 25 ranked"); }
        else if ((rank as number) <= 50) { score += 7; factors.push("Top 50 ranked"); }
        else if ((rank as number) <= 100) { score += 4; factors.push("Top 100 ranked"); }
      }

      return { ...college, score, factors };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return { student, recommendations: scored };
}

// ---------------------------------------------------------------------------
// College Research Notes
// ---------------------------------------------------------------------------
export async function getCollegeResearchNotes(collegeId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = createServerClient();

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

  const db = createServerClient();

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
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = createServerClient();

  const { data } = await db
    .from("audit_events")
    .select("action, metadata, created_at")
    .eq("entity_type", "scorecard_sync")
    .order("created_at", { ascending: false })
    .limit(1);

  const row = data?.[0];
  if (!row) return null;

  return {
    action: row.action as string,
    metadata: row.metadata as Record<string, unknown>,
    created_at: row.created_at as string,
  };
}

export async function getUnsyncedCollegeCount() {
  const db = createServerClient();

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

  const db = createServerClient();
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

  const db = createServerClient();
  const { data } = await db
    .from("firm_memberships")
    .select("user_id, users:user_id(id, first_name, last_name)")
    .eq("firm_id", ctx.firmId)
    .eq("status", "active");

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
export async function getConversations(filters?: { search?: string }) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = createServerClient();

  const { data, error } = await db
    .from("conversations")
    .select(
      `id, conversation_type, visibility_scope, created_at, updated_at,
       students(id, first_name, last_name),
       conversation_participants(
         user_id,
         users:user_id(first_name, last_name)
       ),
       messages(id, body, sent_at, sender_user_id,
         sender:sender_user_id(first_name, last_name)
       )`
    )
    .eq("firm_id", ctx.firmId)
    .order("updated_at", { ascending: false });

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
        sender: { first_name: string; last_name: string };
      }>
    ) ?? [];

    const sorted = [...messages].sort(
      (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    );
    const latest = sorted[0] ?? null;

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

  const db = createServerClient();

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

  const { data: messages } = await db
    .from("messages")
    .select(
      `id, body, sent_at, edited_at,
       sender:sender_user_id(id, first_name, last_name)`
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
      return {
        id: m.id,
        body: m.body,
        sent_at: m.sent_at,
        edited_at: m.edited_at,
        sender_id: sender.id,
        sender_name: `${sender.first_name} ${sender.last_name}`,
        is_mine: sender.id === ctx.dbUserId,
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
}) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = createServerClient();
  let query = db
    .from("documents")
    .select(
      `id, title, category, mime_type, file_size_bytes, storage_key,
       visibility_scope, created_at,
       students(id, first_name, last_name),
       uploader:uploaded_by_user_id(first_name, last_name)`
    )
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (filters?.category) {
    query = query.eq("category", filters.category);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch documents:", error);
    return [];
  }

  let results = (data ?? []).map((d) => {
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

  if (filters?.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (d) =>
        d.title.toLowerCase().includes(term) ||
        d.student_name?.toLowerCase().includes(term)
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------
export async function getFamilies(filters?: { search?: string }) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = createServerClient();

  let query = db
    .from("families")
    .select(
      `id, household_name, city, state_region,
       students(id),
       family_members(is_primary_contact, users:user_id(first_name, last_name))`
    )
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null)
    .order("household_name", { ascending: true });

  if (filters?.search) {
    query = query.ilike("household_name", `%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) {
    const { data: fallback } = await db
      .from("families")
      .select("id, household_name, city, state_region")
      .eq("firm_id", ctx.firmId)
      .is("archived_at", null)
      .order("household_name", { ascending: true });

    return (fallback ?? []).map((f) => ({
      ...f,
      student_count: 0,
      primary_contact: null,
    }));
  }

  return (data ?? []).map((f) => {
    const members = (f as Record<string, unknown>).family_members as
      | Array<{
          is_primary_contact: boolean;
          users: { first_name: string; last_name: string };
        }>
      | undefined;
    const primary = members?.find((m) => m.is_primary_contact);
    const contact = primary?.users ?? members?.[0]?.users;
    const students = (f as Record<string, unknown>).students as
      | Array<{ id: string }>
      | undefined;

    return {
      id: f.id,
      household_name: f.household_name,
      city: f.city,
      state_region: f.state_region,
      student_count: students?.length ?? 0,
      primary_contact: contact
        ? `${contact.first_name} ${contact.last_name}`
        : null,
    };
  });
}

export async function getFamilyById(id: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = createServerClient();
  const { data: family } = await db
    .from("families")
    .select("*")
    .eq("id", id)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!family) return null;

  const [members, students, notes, documents] = await Promise.all([
    db
      .from("family_members")
      .select("id, relationship_type, is_primary_contact, users:user_id(first_name, last_name, email)")
      .eq("family_id", id)
      .eq("firm_id", ctx.firmId),
    db
      .from("students")
      .select("id, first_name, last_name, graduation_year, status")
      .eq("family_id", id)
      .eq("firm_id", ctx.firmId),
    db
      .from("notes")
      .select("id, title, body, created_at, note_type")
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
  ]);

  return {
    ...family,
    members: members.data ?? [],
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

  const db = createServerClient();
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

  const db = createServerClient();

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
export async function getMeetings(filters?: {
  month?: number;
  year?: number;
}) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = createServerClient();

  const now = new Date();
  const year = filters?.year ?? now.getFullYear();
  const month = filters?.month ?? now.getMonth(); // 0-indexed

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59);

  const { data, error } = await db
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
      student_name: student
        ? `${student.first_name} ${student.last_name}`
        : null,
      attendees: attendees.map((a) => ({
        name: `${a.users.first_name} ${a.users.last_name}`,
        status: a.attendance_status,
      })),
    };
  });
}

export async function getUpcomingMeetings(limit = 10) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return [];

  const db = createServerClient();

  const { data } = await db
    .from("meetings")
    .select(
      `id, title, meeting_type, scheduled_start_at, scheduled_end_at,
       location_text, students(first_name, last_name)`
    )
    .eq("firm_id", ctx.firmId)
    .gte("scheduled_start_at", new Date().toISOString())
    .order("scheduled_start_at", { ascending: true })
    .limit(limit);

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

  const db = createServerClient();

  const { data } = await db
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
export async function getReportData() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return null;

  const db = createServerClient();

  const [
    studentsByStatus,
    appsByStage,
    appDecisions,
    taskStats,
    messageCount,
    caseload,
  ] = await Promise.all([
    // Students by status
    db
      .from("students")
      .select("status")
      .eq("firm_id", ctx.firmId)
      .is("archived_at", null),
    // Applications by stage
    db
      .from("applications")
      .select("stage")
      .eq("firm_id", ctx.firmId),
    // Decisions
    db
      .from("applications")
      .select("decision_result")
      .eq("firm_id", ctx.firmId)
      .eq("stage", "decision_received")
      .not("decision_result", "is", null),
    // Tasks
    db
      .from("tasks")
      .select("status")
      .eq("firm_id", ctx.firmId)
      .is("archived_at", null),
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

  const db = createServerClient();

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

  const db = createServerClient();
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

  const db = createServerClient();

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
