import { WorkspaceTabs } from "@/components/structure/workspace-tabs";
import { applicationReadinessPath } from "@/lib/applications/readiness";
import { applicationReviewPath } from "@/lib/applications/final-review";
import { followThroughPath } from "@/lib/applications/follow-through";
import { decisionWorkspacePath } from "@/lib/applications/decisions";

export type ApplicationWorkspaceView = "readiness" | "review" | "follow" | "decision";

/**
 * One tab bar across an application's lifecycle pages (design refresh,
 * phase 2) — readiness, final review, follow-through, decision — so staff,
 * students, and parents move between them the same way. Each destination
 * already exists for all three surfaces and enforces its own access.
 */
export function ApplicationWorkspaceTabs({
  applicationId,
  studentId,
  surface,
  current,
  extra,
}: {
  applicationId: string;
  studentId: string;
  surface: "staff" | "student" | "family";
  current: ApplicationWorkspaceView;
  extra?: React.ReactNode;
}) {
  return (
    <WorkspaceTabs
      label="Application workspace"
      current={current}
      extra={extra}
      tabs={[
        { key: "readiness", label: "Readiness", href: applicationReadinessPath(studentId, surface) },
        { key: "review", label: "Final review", href: applicationReviewPath(applicationId, surface) },
        { key: "follow", label: "Follow-through", href: followThroughPath(applicationId, surface) },
        { key: "decision", label: "Decision and enrollment", href: decisionWorkspacePath(applicationId, surface) },
      ]}
    />
  );
}
