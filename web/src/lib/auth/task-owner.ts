import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthorizationError, requireStudentAccess, type ActorContext } from "./authorize";
import { isPlaceholderUser, isStaffRole } from "./resolve";

export interface OwnerChoice { id: string; name: string; role: string; ready: boolean; primary?: boolean }
export interface OwnerResolution { userId: string | null; role: string; ready: boolean }

/** Shared by interactive creation and background materializers. Never infer intent from audience. */
export async function taskOwnerChoices(db: SupabaseClient, ctx: ActorContext, studentId: string | null): Promise<OwnerChoice[]> {
  if (!isStaffRole(ctx.role)) throw new AuthorizationError();
  let student: { user_id: string | null; family_id: string | null; first_name: string; last_name: string } | null = null;
  if (studentId) {
    await requireStudentAccess(db, ctx, studentId);
    const result = await db.from("students").select("user_id, family_id, first_name, last_name")
      .eq("firm_id", ctx.firmId).eq("id", studentId).is("archived_at", null).maybeSingle();
    if (result.error || !result.data) throw new AuthorizationError("Student not found");
    student = result.data;
  }
  const { data: memberships, error } = await db.from("firm_memberships")
    .select("user_id, role, users!user_id(first_name, last_name, auth_provider_user_id)")
    .eq("firm_id", ctx.firmId).eq("status", "active");
  if (error) throw new Error("Unable to load eligible owners");
  const assignments = studentId ? await db.from("student_staff_assignments").select("user_id, assignment_type, is_primary")
    .eq("firm_id", ctx.firmId).eq("student_id", studentId) : { data: [], error: null };
  const parents = student?.family_id ? await db.from("family_members").select("user_id, users!user_id(first_name, last_name)")
    .eq("firm_id", ctx.firmId).eq("family_id", student.family_id) : { data: [], error: null };
  if (assignments.error || parents.error) throw new Error("Unable to load owner relationships");
  const choices: OwnerChoice[] = [];
  for (const member of memberships ?? []) {
    const user = (Array.isArray(member.users) ? member.users[0] : member.users) as { first_name: string; last_name: string; auth_provider_user_id: string } | null;
    if (!user) continue;
    const assignment = assignments.data?.find(a => a.user_id === member.user_id);
    const eligible = isStaffRole(member.role)
      ? !studentId || !!assignment
      : member.role === "student" ? student?.user_id === member.user_id
      : member.role === "parent_guardian" && parents.data?.some(p => p.user_id === member.user_id);
    if (!eligible) continue;
    choices.push({ id: member.user_id, name: `${user.first_name} ${user.last_name}`,
      role: isStaffRole(member.role) ? assignment?.assignment_type ?? member.role : member.role,
      primary: assignment?.is_primary ?? false,
      ready: !isPlaceholderUser(user.auth_provider_user_id) });
  }
  // A family contact without active portal membership is still selectable by
  // explicit identity, but cannot receive published work until invited/linked.
  for (const parent of parents.data ?? []) {
    if (choices.some(c => c.id === parent.user_id)) continue;
    const user = (Array.isArray(parent.users) ? parent.users[0] : parent.users) as { first_name: string; last_name: string } | null;
    if (user) choices.push({ id: parent.user_id, name: `${user.first_name} ${user.last_name}`, role: "parent_guardian", ready: false });
  }
  if (student && !choices.some(c => c.role === "student")) choices.unshift({ id: "student", name: `${student.first_name} ${student.last_name}`, role: "student", ready: false });
  return choices;
}

export async function resolveTaskOwner(db: SupabaseClient, input: {
  firmId: string; studentId: string | null; actingUserId: string; role?: string | null; userId?: string | null;
}): Promise<OwnerResolution> {
  const { data: actor, error } = await db.from("firm_memberships").select("role")
    .eq("firm_id", input.firmId).eq("user_id", input.actingUserId).eq("status", "active").maybeSingle();
  if (error || !actor || !isStaffRole(actor.role)) throw new AuthorizationError();
  const choices = await taskOwnerChoices(db, { firmId: input.firmId, dbUserId: input.actingUserId, role: actor.role }, input.studentId);
  const role = input.role || "counselor";
  if (input.userId) {
    const choice = choices.find(c => c.id === input.userId);
    if (!choice) throw new AuthorizationError("Choose an eligible owner for this student");
    return { userId: choice.id === "student" ? null : choice.id, role: choice.role, ready: choice.ready };
  }
  if (role === "parent_guardian") return { userId: null, role, ready: false }; // Never choose a parent implicitly.
  const matching = choices.filter(c => c.role === role);
  const primary = matching.filter(c => c.primary);
  const choice = matching.length === 1 ? matching[0] : primary.length === 1 ? primary[0] : null;
  return { userId: choice && choice.id !== "student" ? choice.id : null, role, ready: !!choice?.ready };
}
