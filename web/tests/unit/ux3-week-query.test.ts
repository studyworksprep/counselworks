import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("@/lib/auth/resolve", () => ({
  resolveUserAndFirm: async () => ({firmId:"alpha", dbUserId:"carl", role:"counselor"}),
  getAssignedStudentIds: async () => ["sam"], STAFF_ROLE_LIST: ["counselor"],
}));
vi.mock("@/lib/db/client", () => ({ getDb: () => database() }));
function database() {
  const base = {firm_id:"alpha",student_id:"sam",assigned_user_id:"carl",title:"Work",status:"pending",archived_at:null,
    owner_pending:false,dependency_blocked:false,needs_attention:false,due_at:"2026-03-07T05:00:00.000Z",
    "student_workflow_steps.student_workflows.firm_id":"alpha","student_workflow_steps.student_workflows.status":"in_progress",
    student_workflow_steps:[{id:"step"}],assigned_user:{id:"carl",first_name:"Carl",last_name:"Test"}};
  const data = [
    {...base,id:"start"}, {...base,id:"changes",status:"changes_requested",due_at:"2026-03-14T03:59:59.000Z"},
    {...base,id:"end",due_at:"2026-03-14T04:00:00.000Z"}, {...base,id:"past",due_at:"2026-03-07T04:59:59.000Z"},
    ...["completed","submitted","cancelled"].map(status=>({...base,id:status,status})),
    {...base,id:"blocked",dependency_blocked:true}, {...base,id:"attention",needs_attention:true},
    {...base,id:"archived",archived_at:"2026-01-01"}, {...base,id:"unresolved",owner_pending:true},
    {...base,id:"other-owner",assigned_user_id:"sam"}, {...base,id:"other-caseload",student_id:"other"},
    {...base,id:"foreign",firm_id:"beta"}, {...base,id:"standalone",student_workflow_steps:null},
    {...base,id:"paused","student_workflow_steps.student_workflows.status":"paused"},
  ];
  return {from(table: string) {
    let rows: Record<string,unknown>[] = table === "tasks" ? data : table === "firms" ? [{id:"alpha",timezone:"America/New_York"}] : table === "student_staff_assignments" ? [{firm_id:"alpha",student_id:"sam",user_id:"carl"}] : [];
    const q = {
      select: (fields:string) => {if(table === "tasks" && fields.includes("fkey!inner")) rows=rows.filter(r=>r.student_workflow_steps);return q;},
      eq: (k:string,v:unknown) => {rows=rows.filter(r=>r[k]===v);return q;},
      is: (k:string,v:unknown) => q.eq(k,v),
      not: (k:string,_op:string,v:unknown) => {rows=rows.filter(r=>r[k]!==v);return q;},
      in: (k:string,v:unknown[]) => {rows=rows.filter(r=>v.includes(r[k]));return q;},
      gte: (k:string,v:string) => {rows=rows.filter(r=>String(r[k])>=v);return q;},
      lt: (k:string,v:string) => {rows=rows.filter(r=>String(r[k])<v);return q;},
      order: () => q,
      or: () => {rows=rows.filter(r=>r.student_id === "sam" || r.student_id === null);return q;},
      single: async () => ({data:rows[0],error:null}),
      then: (resolve:(v:unknown)=>unknown) => Promise.resolve({data:rows,count:rows.length,error:null}).then(resolve),
    };return q;
  }} as unknown as SupabaseClient;
}
import { getTasks } from "@/lib/db/queries";
import { getCounselorDashboardStats } from "@/modules/reports/service";
afterEach(()=>vi.useRealTimers());
it("weekly metric and destination agree at DST boundaries and exclude non-actionable or unauthorized rows",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-03-07T18:00:00Z"));
  const rows=await getTasks({view:"my",work:"workflow-week"});
  expect(rows.map(r=>r.id)).toEqual(["start","changes"]);
  const stats=await getCounselorDashboardStats(database(),"alpha","carl");
  expect(stats.workflow_steps_due_this_week).toBe(rows.length);
});
