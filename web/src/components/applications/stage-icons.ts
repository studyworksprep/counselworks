import type { IconName } from "@/components/ui/icon";
import type { APPLICATION_STAGES } from "@/lib/constants/applications";

type ApplicationStage = (typeof APPLICATION_STAGES)[number]["value"];

/**
 * One glyph per application stage (design refresh). Typed against
 * APPLICATION_STAGES so a new stage cannot ship without an icon. The
 * sequence tells the story: a dashed ring (nothing yet), a half-filled ring
 * (under way), a paper airplane (sent), an hourglass (the college is
 * reading), an opened envelope (the decision), and a struck ring for an
 * application that left the pipeline.
 */
export const STAGE_ICONS: Record<ApplicationStage, IconName> = {
  not_started: "stageNotStarted",
  in_progress: "stageInProgress",
  submitted: "stageSubmitted",
  under_review: "stageUnderReview",
  decision_received: "stageDecision",
  withdrawn: "stageWithdrawn",
};

export function stageIcon(stage: string): IconName {
  return STAGE_ICONS[stage as ApplicationStage] ?? "stageNotStarted";
}
