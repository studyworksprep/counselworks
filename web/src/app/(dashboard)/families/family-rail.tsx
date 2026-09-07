"use client";

import { usePathname } from "next/navigation";
import { EntityRail } from "@/components/layout/entity-rail";
import type { FamilyRailEntry } from "@/lib/db/queries";
import { FAMILY_RAIL_COOKIE } from "@/lib/ui/layout-prefs";
import { groupFamiliesByYear } from "@/lib/ui/rail-groups";

const FAMILY_PATH = /^\/families\/([0-9a-f-]{36})(\/.*)?$/;

/**
 * Household rail (fix plan 13.0, families): search, Add family, and
 * one-click switching between households that keeps the current sub-page
 * (Billing → the next family's Billing). Grouped by the class year of each
 * household's soonest-graduating student. Chrome and collapse behaviour
 * live in the shared EntityRail.
 */
export function FamilyRail({
  families,
  canCreate,
  initialCollapsed,
}: {
  families: FamilyRailEntry[];
  canCreate: boolean;
  initialCollapsed: boolean;
}) {
  const pathname = usePathname();
  const match = FAMILY_PATH.exec(pathname);
  const currentId = match?.[1] ?? null;
  const section = match?.[2] ?? "";

  return (
    <EntityRail
      label="Families"
      groups={groupFamiliesByYear(families)}
      currentId={currentId}
      hrefFor={(id) => `/families/${id}${section}`}
      rosterHref="/families"
      createHref={canCreate ? "/families/new" : undefined}
      createLabel="Add family"
      searchPlaceholder="Search families…"
      emptyText="No families yet."
      cookieName={FAMILY_RAIL_COOKIE}
      initialCollapsed={initialCollapsed}
      icon={
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      }
    />
  );
}
