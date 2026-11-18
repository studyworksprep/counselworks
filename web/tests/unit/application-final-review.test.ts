import { describe, expect, it } from "vitest";
import {
  applicationReviewPath,
  prepareReviewSchema,
  reviewActionSchema,
  submissionPacketText,
} from "@/lib/applications/final-review";
import { canEditApplicationReview } from "@/lib/auth/application-review";

describe("final application handoff", () => {
  it("exports exact Unicode writing without private coaching fields or confirmation references", () => {
    const body = "I learned from José.\n\n我们一起工作。 🧭";
    const packet = {
      number: 3,
      privateNotes: "PRIVATE NOTES",
      submission_confirmation: "SECRET-REFERENCE",
      manifest: {
        college: "Example College",
        round: "rd",
        deadline: null,
        generalEssayIds: [],
        privateInterview: "PRIVATE ANSWER",
        essays: [
          {
            id: "essay",
            title: "Response",
            prompt: "What matters?",
            body,
            versionId: "version",
            version: 7,
            wordLimit: 250,
            characterLimit: null,
            words: 9,
            characters: 36,
            general: false,
            feedback: "PRIVATE FEEDBACK",
            commentary: "PRIVATE COMMENTARY",
          },
        ],
      },
    };
    const exported = submissionPacketText(packet);
    expect(exported).toContain(body);
    expect(exported).toContain("saved version 7");
    expect(exported).toContain("Maximum 250 words");
    expect(exported).not.toMatch(
      /PRIVATE|SECRET-REFERENCE|versionId|generalEssayIds/,
    );
  });
  it("keeps three personas in their own routes", () => {
    expect(applicationReviewPath("a", "staff")).toBe("/applications/a/review");
    expect(applicationReviewPath("a", "student")).toBe(
      "/student-applications/a/review",
    );
    expect(applicationReviewPath("a", "family")).toBe(
      "/family-applications/a/review",
    );
  });
  it("does not grant parents or read-only staff approval writes", () => {
    for (const role of [
      "firm_owner",
      "firm_admin",
      "counselor",
      "essay_coach",
      "tutor",
      "student",
    ])
      expect(canEditApplicationReview(role)).toBe(true);
    for (const role of ["parent_guardian", "read_only_staff", "outsider"])
      expect(canEditApplicationReview(role)).toBe(false);
  });
  it("requires a displayed snapshot and explicit confirmation", () => {
    const applicationId = "c6100000-0000-4000-8000-000000000003",
      packetId = "c6100000-0000-4000-8000-000000000004";
    expect(
      prepareReviewSchema.safeParse({
        applicationId,
        generalEssayIds: [],
        fingerprint: "invented",
      }).success,
    ).toBe(false);
    expect(
      reviewActionSchema.safeParse({
        applicationId,
        packetId,
        revision: 1,
        action: "submit",
        confirmed: false,
      }).success,
    ).toBe(false);
    expect(
      reviewActionSchema.safeParse({
        applicationId,
        packetId,
        revision: 1,
        action: "submit",
        confirmed: true,
        submittedOn: "2026-02-30",
        platform: "Common App",
      }).success,
    ).toBe(false);
  });
});
