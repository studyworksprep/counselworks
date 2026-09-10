import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
vi.mock("@/components/layout/page-shell",()=>({PageShell:({children}:{children:ReactNode})=>createElement("main",null,children)}));
vi.mock("@/lib/auth/resolve",()=>({resolveUserAndFirm:async()=>({firmId:"firm",role:"owner"}),isFirmWideRole:()=>true}));
vi.mock("@/lib/db/client",()=>({getDb:()=>({})}));
vi.mock("@/modules/reports/service",()=>({getFirmDashboardStats:async()=>({active_students:3,upcoming_deadlines:2,overdue_tasks:1,active_workflows:4,stalled_workflows:0,students_by_counselor:[]})}));
vi.mock("@/lib/db/queries",()=>({getRecentActivity:async()=>[],getUpcomingMeetingsForUser:async()=>[],getTodayAgenda:async()=>[],getTasksNeedingReview:async()=>{throw new Error("Unable to load review queue",{cause:{code:"42703"}});}}));
import DashboardPage from "@/app/(dashboard)/dashboard/page";
it("renders the owner dashboard when the production review schema is unavailable",async()=>{
  const log=vi.spyOn(console,"error").mockImplementation(()=>{});
  try {
    const html=renderToStaticMarkup(await DashboardPage());
    expect(html).toContain("Active Students");
    expect(html).toContain("Recent Activity");
    expect(html).toContain("Review queue unavailable");
    expect(html).not.toContain("Needs review (0)");
  } finally {log.mockRestore();}
});
