"use client";
import { useId, useState } from "react";
import { Select } from "@/components/ui/select";
import {
  compareSavedDrafts,
  type SavedEssayVersion,
} from "@/lib/essays/drafting";

export function EssayVersionCompare({
  versions,
}: {
  versions: SavedEssayVersion[];
}) {
  const id = useId(),
    ordered = versions.toSorted((a, b) => b.number - a.number);
  const [chosenFrom, setFrom] = useState(""),
    [chosenTo, setTo] = useState("");
  const from =
      chosenFrom ||
      ordered.find((v) => v.submitted && v.number !== ordered[0]?.number)?.id ||
      ordered[1]?.id ||
      ordered[0]?.id ||
      "",
    to = chosenTo || ordered[0]?.id || "";
  const earlier = ordered.find((v) => v.id === from),
    later = ordered.find((v) => v.id === to);
  const beforeText = earlier?.body ?? "",
    afterText = later?.body ?? "";
  const chunks = compareSavedDrafts(beforeText, afterText);
  if (!versions.length) return null;
  const options = ordered.map((v) => ({
    value: v.id,
    label: `Version ${v.number}${v.latestSubmitted ? " · Latest submitted" : v.submitted ? " · Submitted" : ""}`,
  }));
  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-4"
      aria-labelledby={`${id}-heading`}
    >
      <h2 id={`${id}-heading`} className="font-semibold">
        Compare saved versions
      </h2>
      <p className="mt-2 text-xs leading-5 text-gray-500">
        Recent saved versions are shown, including the latest submitted version.
        Unsaved writing is separate. Comments retain the version they refer to.
      </p>
      {versions.length < 2 ? (
        <p className="mt-3 text-sm text-gray-500">
          Save another version to compare revisions.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Select
              id={`${id}-from`}
              label="Earlier saved version"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              options={options}
            />
            <Select
              id={`${id}-to`}
              label="Later saved version"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              options={options}
            />
          </div>
          <p className="mt-3 text-xs text-gray-600">
            <span className="bg-success-50 px-1 text-success-800">
              Added text
            </span>{" "}
            ·{" "}
            <span className="bg-danger-50 px-1 text-danger-800 line-through">
              Removed text
            </span>
          </p>
          {earlier?.body === later?.body ? (
            <p className="mt-3 text-sm text-gray-500">
              No text changes between these saved versions.
            </p>
          ) : (
            <div
              className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-gray-100 p-3 text-sm leading-7"
              aria-label="Saved draft changes"
            >
              {chunks.map((chunk, i) =>
                chunk.kind === "added" ? (
                  <ins
                    key={i}
                    className="bg-success-50 text-success-800 no-underline"
                  >
                    <span className="sr-only">Added: </span>
                    {chunk.text}
                  </ins>
                ) : chunk.kind === "removed" ? (
                  <del key={i} className="bg-danger-50 text-danger-800">
                    <span className="sr-only">Removed: </span>
                    {chunk.text}
                  </del>
                ) : (
                  <span key={i}>{chunk.text}</span>
                ),
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
