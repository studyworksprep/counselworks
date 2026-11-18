import { z } from "zod";
import { dateOnly } from "../tasks/due-date";
import { DECISION_RESULTS } from "../constants/applications";
import type { StatusTone } from "../constants/tones";

export const NEXT_STEP_KINDS = ["waitlist", "deferral", "enrollment"] as const;
export type NextStepKind = (typeof NEXT_STEP_KINDS)[number];
export const NEXT_STEP_LABELS = {
  waitlist: "Waitlist follow-up",
  deferral: "Deferral follow-up",
  enrollment: "Enrollment checklist",
};
export const NEXT_STEP_STATUSES = [
  ["needed", "Needed"],
  ["in_progress", "In progress"],
  ["completed", "Confirmed complete"],
  ["waived", "Not required"],
] as const;
export const NEXT_STEP_STATUS_TONES: Record<string, StatusTone> = {
  needed: "neutral",
  in_progress: "active",
  completed: "done",
  waived: "muted",
};
export function decisionStepKind(result: string | null): NextStepKind | null {
  return result === "accepted"
    ? "enrollment"
    : result === "waitlisted"
      ? "waitlist"
      : result === "deferred"
        ? "deferral"
        : null;
}
export function decisionWorkspacePath(
  id: string,
  surface: "staff" | "student" | "family",
) {
  return `${surface === "staff" ? "/applications" : `/${surface}-applications`}/${id}/decisions`;
}
export const decisionSchema = z
  .object({
    applicationId: z.uuid(),
    revision: z.number().int().nonnegative(),
    result: z.enum(DECISION_RESULTS.map((d) => d.value)),
    decidedOn: dateOnly,
    depositStatus: z.enum(["", "committed", "declined"]),
    prepareFollowUp: z.boolean(),
  })
  .refine(
    (p) => p.result === "accepted" || !p.depositStatus,
    "Enrollment status requires acceptance",
  );
export const nextStepSchema = z
  .object({
    applicationId: z.uuid(),
    id: z.uuid().optional(),
    revision: z.number().int().nonnegative(),
    decisionRevision: z.number().int().nonnegative(),
    kind: z.enum(NEXT_STEP_KINDS),
    title: z.string().trim().min(1).max(160),
    status: z.enum(NEXT_STEP_STATUSES.map((s) => s[0])),
    dueOn: dateOnly.nullable(),
    completedOn: dateOnly.nullable(),
    notes: z.string().trim().max(4000),
    essayId: z.uuid().nullable().optional(),
    documentId: z.uuid().nullable().optional(),
  })
  .superRefine((p, ctx) => {
    if ((p.status === "completed") !== !!p.completedOn)
      ctx.addIssue({
        code: "custom",
        message: "Record a completion date only for confirmed completion",
      });
    if (!!p.id !== p.revision > 0)
      ctx.addIssue({ code: "custom", message: "Refresh this next step" });
  });
export const stepReferenceSchema = z.object({
  applicationId: z.uuid(),
  id: z.uuid(),
  revision: z.number().int().positive(),
});
