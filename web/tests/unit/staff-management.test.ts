import { beforeEach, describe, expect, it, vi } from "vitest";
import { isActiveStaffMember, isStaffRole, staffRoleLabel, STAFF_ROLE_LIST } from "@/lib/constants/roles";

const state = vi.hoisted(() => ({ role: "firm_owner", rows: [] as Record<string, unknown>[], writes: 0, race: false }));
const id = "a0000000-0000-4000-8000-000000000011";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendInvitationEmail: vi.fn() }));
vi.mock("@/lib/auth/resolve", async () => ({
  ...(await import("@/lib/constants/roles")),
  resolveUserAndFirm: async () => ({ dbUserId: "owner", firmId: "alpha", role: state.role }),
}));
vi.mock("@/lib/db/client", () => {
  const db = { from(table: string) {
    let rows = table === "firm_memberships" ? state.rows : table === "users" ? [{ id: "client", email: "client@example.com" }] : [];
    let update: Record<string, unknown> | undefined;
    const q = {
      select: () => q, order: () => q,
      eq: (k: string, v: unknown) => { rows = rows.filter(r => r[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[k])); return q; },
      update: (v: Record<string, unknown>) => {
        if (state.race) state.rows.forEach(r => { r.role = "student"; });
        update = v; return q;
      },
      single: () => q.maybeSingle(),
      maybeSingle: async () => {
        if (update) { rows.forEach(r => Object.assign(r, update)); state.writes += rows.length; }
        return { data: rows[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    }; return q;
  } };
  return { getDb: () => db, createServerClient: () => db };
});
import { updateMemberRole, removeMember, inviteStaffMember } from "@/lib/actions/settings";
import { getFirmSettings } from "@/lib/db/queries";

beforeEach(() => {
  state.role = "firm_owner"; state.writes = 0; state.race = false;
  state.rows = [{ id, firm_id: "alpha", user_id: "client", role: "counselor", status: "active", users: { id: "client", first_name: "Test", last_name: "Staff", email: "client@example.com" } }];
});
describe("staff roster and direct actions", () => {
  it("returns and counts only active staff from this firm in a mixed roster", async () => {
    state.rows.push(...["student", "parent_guardian", "unknown"].map(role => ({ ...state.rows[0], role })));
    state.rows.push({ ...state.rows[0], status: "inactive" }, { ...state.rows[0], firm_id: "beta" });
    const data = await getFirmSettings();
    expect(data?.members).toHaveLength(1);
    expect(data?.members.filter(isActiveStaffMember)).toHaveLength(1);
    expect(staffRoleLabel("unknown")).toBe("Unknown role");
    expect(isStaffRole("student")).toBe(false);
    expect(STAFF_ROLE_LIST.map(staffRoleLabel)).not.toContain("Unknown role");
  });
  it.each(["student", "parent_guardian", "unknown"])("denies changing or removing a %s target", async role => {
    state.rows[0].role = role;
    expect(await updateMemberRole(id, "firm_owner")).toHaveProperty("error");
    expect(await removeMember(id)).toHaveProperty("error");
    expect(state.writes).toBe(0);
  });
  it("denies cross-firm, inactive, missing and malformed targets", async () => {
    for (const row of [{ ...state.rows[0], firm_id: "beta" }, { ...state.rows[0], status: "inactive" }, { ...state.rows[0], id: "missing" }]) {
      state.rows = [row];
      expect(await updateMemberRole(id, "tutor")).toHaveProperty("error");
      expect(await removeMember(id)).toHaveProperty("error");
    }
    expect(await removeMember("invalid")).toHaveProperty("error");
    expect(state.writes).toBe(0);
  });
  it.each(["counselor", "student", "parent_guardian", "read_only_staff", "unknown"])("denies the %s actor", async role => {
    state.role = role;
    expect(await updateMemberRole(id, "firm_owner")).toHaveProperty("error");
    expect(await removeMember(id)).toHaveProperty("error");
    expect(state.writes).toBe(0);
  });
  it("rejects non-staff destination roles and a target that becomes a client before update", async () => {
    for (const role of ["student", "parent_guardian", "unknown"]) expect(await updateMemberRole(id, role)).toHaveProperty("error");
    state.race = true;
    expect(await updateMemberRole(id, "tutor")).toHaveProperty("error");
    expect(state.writes).toBe(0);
  });
  it.each(["firm_owner", "firm_admin"])("preserves legitimate %s staff management", async role => {
    state.role = role;
    expect(await updateMemberRole(id, "essay_coach")).toEqual({ success: true });
    expect(state.rows[0].role).toBe("essay_coach");
    expect(await removeMember(id)).toEqual({ success: true });
    expect(state.rows[0].status).toBe("inactive");
  });
  it("does not convert an inactive client via staff invitation reactivation", async () => {
    const form = new FormData(); form.set("email", "client@example.com"); form.set("role", "counselor");
    state.rows[0].status = "inactive"; state.rows[0].role = "parent_guardian";
    expect(await inviteStaffMember(form)).toHaveProperty("error");
    form.set("role", "student");
    expect(await inviteStaffMember(form)).toHaveProperty("error");
    expect(state.writes).toBe(0);
  });
});
