"use client";

import { usePathname } from "next/navigation";
import { EntitySwitcher } from "@/components/layout/entity-switcher";
import type { FamilyRailEntry } from "@/lib/db/queries";
import { groupFamiliesByYear } from "@/lib/ui/rail-groups";

/** Narrow-screen family switcher in the workspace header (fix plan 13.0). */
export function FamilySwitcher({
  families,
  currentId,
}: {
  families: FamilyRailEntry[];
  currentId: string;
}) {
  const pathname = usePathname();
  const base = `/families/${currentId}`;
  const section = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  return (
    <EntitySwitcher
      label="Switch family"
      groups={groupFamiliesByYear(families)}
      currentId={currentId}
      hrefFor={(id) => `/families/${id}${section}`}
    />
  );
}
