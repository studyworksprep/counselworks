"use client";

import { useRouter } from "next/navigation";
import type { RailGroup } from "./entity-rail";

/**
 * Compact switcher for screens too narrow for the rail (fix plan 13.0): a
 * grouped select in the workspace header. Switching keeps the current
 * sub-page, like the rail.
 */
export function EntitySwitcher({
  label,
  groups,
  currentId,
  hrefFor,
}: {
  /** Accessible name, e.g. "Switch student". */
  label: string;
  groups: RailGroup[];
  currentId: string;
  hrefFor: (id: string) => string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label={label}
      value={currentId}
      onChange={(e) => router.push(hrefFor(e.target.value))}
      className="max-w-[12rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 @min-[72rem]/workspace:hidden"
    >
      {groups.map((g) => (
        <optgroup key={g.key} label={g.label}>
          {g.items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
