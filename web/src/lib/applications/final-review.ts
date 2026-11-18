import { z } from "zod";
import type { TaskSurface } from "../constants/task-links";

export const REVIEW_ACTIONS = [
  "approve_student",
  "approve_counselor",
  "withdraw_student",
  "withdraw_counselor",
  "share",
  "unshare",
  "submit",
] as const;
export const SUBMISSION_PLATFORMS = [
  "Common App",
  "Coalition / Scoir",
  "College portal",
  "Other",
] as const;
export const reviewSelectionSchema = z.object({
  applicationId: z.uuid(),
  generalEssayIds: z.array(z.uuid()).max(20),
});
export const prepareReviewSchema = reviewSelectionSchema.extend({
  fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
});
export const reviewActionSchema = z.object({
  applicationId: z.uuid(),
  packetId: z.uuid(),
  revision: z.number().int().positive(),
  action: z.enum(REVIEW_ACTIONS),
  confirmed: z.literal(true),
  submittedOn: z.iso.date().optional(),
  platform: z.enum(SUBMISSION_PLATFORMS).optional(),
  confirmation: z.string().trim().max(200).optional(),
});

export type PacketEssay = {
  id: string;
  title: string;
  prompt: string;
  body: string;
  versionId: string | null;
  version: number;
  wordLimit: number | null;
  characterLimit: number | null;
  words: number;
  characters: number;
  general: boolean;
};
export type PacketManifest = {
  college: string;
  round: string | null;
  deadline: string | null;
  generalEssayIds: string[];
  essays: PacketEssay[];
};
export type ReviewPreview = {
  fingerprint: string;
  manifest: PacketManifest;
  blockers: string[];
  warnings: string[];
};
export type ReviewPacket = {
  id: string;
  application_id: string;
  number: number;
  revision: number;
  fingerprint: string;
  manifest: PacketManifest;
  created_at: string;
  preparedOn: string;
  student_approved_at: string | null;
  counselor_approved_at: string | null;
  family_shared: boolean;
  submitted_on: string | null;
  submission_platform: string | null;
  submission_confirmation: string | null;
  recorded_at: string | null;
  current: boolean | null;
};
export function applicationReviewPath(
  applicationId: string,
  surface: TaskSurface,
) {
  return surface === "staff"
    ? `/applications/${applicationId}/review`
    : surface === "student"
      ? `/student-applications/${applicationId}/review`
      : `/family-applications/${applicationId}/review`;
}

/** Deliberate allowlist: no notes, source interviews, feedback, tasks or sharing metadata enter an export. */
export function submissionPacketText(
  packet: Pick<ReviewPacket, "number" | "manifest">,
) {
  const { manifest } = packet;
  return (
    [
      `${manifest.college} — submission packet ${packet.number}`,
      manifest.round
        ? `Application round: ${manifest.round.toUpperCase()}`
        : "",
      "Copy each response into the matching application field. Check formatting and the portal's own counters before submitting.",
      ...manifest.essays.map((e) =>
        [
          `${e.title} — saved version ${e.version}`,
          [
            e.wordLimit ? `Maximum ${e.wordLimit} words` : "",
            e.characterLimit ? `Maximum ${e.characterLimit} characters` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          e.prompt ? `Prompt: ${e.prompt}` : "",
          "Response:",
          e.body,
        ]
          .filter(Boolean)
          .join("\n\n"),
      ),
    ]
      .filter(Boolean)
      .join("\n\n--------------------\n\n") + "\n"
  );
}
