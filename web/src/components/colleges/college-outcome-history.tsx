import { PORTAL_MIN_DECISIONS } from "@/lib/colleges/scattergram";
import type { OutcomePoint } from "@/lib/colleges/scattergram";
import { Scattergram, type SelfMarker } from "./scattergram";

/**
 * Portal card section (fix plan 13.2): the firm's anonymized decision
 * history at one college, collapsed by default, with the viewer's own
 * student marked. Below the privacy floor it says so instead of drawing a
 * chart that could identify a classmate.
 */
export function CollegeOutcomeHistory({
  collegeName,
  outcomes,
  self,
}: {
  collegeName: string;
  outcomes: { points: OutcomePoint[]; total: number } | undefined;
  self: SelfMarker | null;
}) {
  const total = outcomes?.total ?? 0;
  return (
    <details
      className="mt-3 border-t border-gray-100 pt-2 text-xs"
      data-testid="college-outcome-history"
      data-college={collegeName}
    >
      <summary className="cursor-pointer font-medium text-gray-700">
        Admission history at this college
        <span className="ml-1 font-normal text-gray-500">
          ({total} decision{total === 1 ? "" : "s"} recorded)
        </span>
      </summary>
      <div className="mt-3">
        {outcomes && outcomes.points.length > 0 ? (
          <Scattergram
            points={outcomes.points}
            self={self}
            showNames={false}
            title={`Admission outcomes at ${collegeName} recorded by your counseling firm`}
          />
        ) : (
          <p className="text-gray-500">
            Outcome history appears once your counseling firm has recorded at
            least {PORTAL_MIN_DECISIONS} decisions at this college
            {total > 0 ? ` (${total} so far)` : ""}. Each point is anonymous.
          </p>
        )}
      </div>
    </details>
  );
}
