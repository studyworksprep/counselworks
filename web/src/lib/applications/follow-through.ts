import { z } from "zod";
import { dateOnly } from "../tasks/due-date";

export const FOLLOW_THROUGH_KINDS = ["receipt", "portal", "material"] as const;
export const FOLLOW_THROUGH_STATUSES = {
  receipt: [
    ["awaiting", "Awaiting acknowledgment"],
    ["received", "Acknowledgment received"],
  ],
  portal: [
    ["awaiting", "Awaiting access"],
    ["active", "Portal activated"],
  ],
  material: [
    ["needed", "Needed"],
    ["requested", "Requested"],
    ["sent", "Sent — awaiting receipt"],
    ["received", "Received by college"],
    ["waived", "Waived / not required"],
  ],
} as const;
export type FollowThroughKind = (typeof FOLLOW_THROUGH_KINDS)[number];
const optionalDate = dateOnly.nullable();
export const portalUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an https portal address without login credentials");
export const followThroughSchema = z
  .object({
    applicationId: z.uuid(),
    id: z.uuid().optional(),
    revision: z.number().int().nonnegative(),
    kind: z.enum(FOLLOW_THROUGH_KINDS),
    title: z.string().trim().min(1).max(160),
    status: z.string(),
    sentOn: optionalDate,
    receivedOn: optionalDate,
    checkedOn: optionalDate,
    portalUrl,
    notes: z.string().trim().max(4000),
    documentId: z.uuid().nullable().optional(),
  })
  .superRefine((p, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!FOLLOW_THROUGH_STATUSES[p.kind].some(([value]) => value === p.status))
      fail("Choose a valid tracking status");
    if (p.status === "received" && !p.receivedOn)
      fail("Add the date the college confirmed receipt");
    if (p.status !== "received" && p.receivedOn)
      fail("Receipt date requires confirmed receipt");
    if (p.status === "sent" && !p.sentOn)
      fail("Add the date the material was sent");
    if (p.kind !== "material" && p.sentOn)
      fail("Sent dates belong to materials");
    if (p.kind !== "portal" && p.portalUrl)
      fail("Portal addresses belong to portal tracking");
    if (p.sentOn && p.receivedOn && p.receivedOn < p.sentOn)
      fail("Receipt cannot precede sending");
    if (!!p.id !== p.revision > 0) fail("Refresh this tracking item");
  });
export const followThroughSharingSchema = z.object({
  applicationId: z.uuid(),
  id: z.uuid(),
  revision: z.number().int().positive(),
  shared: z.boolean(),
});
export const followThroughTaskSchema = z.object({
  applicationId: z.uuid(),
  id: z.uuid(),
  revision: z.number().int().positive(),
  ownerId: z.uuid(),
  dueOn: dateOnly,
  taskId: z.uuid().optional(),
  taskRevision: z.number().int().nonnegative().optional(),
});
export function followThroughPath(
  applicationId: string,
  surface: "staff" | "student" | "family",
) {
  return `${surface === "staff" ? "/applications" : `/${surface}-applications`}/${applicationId}/follow-through`;
}
export function followThroughResolved(kind: string, status: string) {
  return kind !== "portal" && ["received", "waived"].includes(status);
}
export function followThroughStatusLabel(
  kind: FollowThroughKind,
  status: string,
) {
  return (
    FOLLOW_THROUGH_STATUSES[kind].find(([value]) => value === status)?.[1] ??
    status
  );
}
