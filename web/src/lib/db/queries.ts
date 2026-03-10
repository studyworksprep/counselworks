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
