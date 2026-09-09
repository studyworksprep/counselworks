import { TASK_PRIORITY_OPTIONS } from "../constants/tasks";
import { z } from "zod";

export { dateOnly, offsetDate } from "../tasks/due-date";
import { dateOnly } from "../tasks/due-date";
export const planEditSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(), description: z.string().max(20000).nullable().optional(),
  owner: z.string().uuid().nullable().optional(), priority: z.enum(TASK_PRIORITY_OPTIONS.map(p=>p.value)).optional(),
  due: dateOnly.nullable().optional(),
});
export type PlanEdit = z.infer<typeof planEditSchema>;
export interface PlanInput { templateId: string; studentId: string; startDate?: string; studentCollegeId?: string; name?: string; edits?: Record<string,PlanEdit>; repeatKey?: string }
export interface PlanSnapshot {
  title: string; description: string | null; priority: string; visibility: string; owner: string | null;
  ownerRole: string; ownerReady: boolean; completionMode: string; taskType: string; dependency: string | null;
  dueSource: "start" | "application" | "manual" | "estimate" | "legacy"; applicationId: string | null;
  deadlineOffset: number | null; estimate: boolean; timezone: string;
}
export interface PreviewStep { template_step_id: string; assigned_user_id: string | null; due_date: string | null; snapshot_json: PlanSnapshot }
export interface PlanPreview {
  fingerprint: string; name: string; description:string|null; studentName:string; startDate: string; timezone: string; today: string; existingId: string | null;
  steps: PreviewStep[]; owners: {id:string;name:string;role:string;ready:boolean}[];
  sourceChecks: {student:{id:string;updated_at:string}; template: {id:string;updated_at:string}; steps: {id:string;updated_at:string}[]; applications: {id:string;updated_at:string}[]};
}
