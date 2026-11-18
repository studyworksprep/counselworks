import { cn } from "@/lib/utils";
import { ProgressBar } from "./progress-bar";

/**
 * Word meter (design refresh, phase 2): a bar toward the word limit and the
 * counts beneath, turning red with an explicit "over limit" past it.
 */
export function WordMeter({
  words,
  limit,
  characters,
  characterLimit,
  className,
}: {
  words: number;
  limit?: number | null;
  characters?: number;
  characterLimit?: number | null;
  className?: string;
}) {
  const overWords = !!limit && words > limit;
  const overCharacters =
    characters !== undefined && !!characterLimit && characters > characterLimit;
  return (
    <div className={cn("min-w-0", className)}>
      {limit ? (
        <ProgressBar
          label="Words used"
          value={Math.min(words, limit)}
          max={limit}
          caption={false}
          tone={overWords ? "problem" : "active"}
          size="sm"
        />
      ) : null}
      <p className={cn("flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs tabular-nums text-gray-600", limit && "mt-1.5")}>
        <span className={overWords ? "font-semibold text-danger-700" : undefined}>
          <span className={overWords ? undefined : "font-semibold text-gray-900"}>{words}</span>
          {limit ? ` / ${limit}` : ""} words{overWords ? " — over limit" : ""}
        </span>
        {characters !== undefined && (
          <span className={overCharacters ? "font-semibold text-danger-700" : undefined}>
            {characters}
            {characterLimit ? ` / ${characterLimit}` : ""} characters
            {overCharacters ? " — over limit" : ""}
          </span>
        )}
      </p>
    </div>
  );
}
