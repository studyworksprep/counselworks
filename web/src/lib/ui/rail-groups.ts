import type { RailGroup } from "@/components/layout/entity-rail";
import type { FamilyRailEntry, StudentRailEntry } from "@/lib/db/queries";
import { STUDENT_STATUS_LABELS } from "@/lib/constants/students";

/** Class-year groups for the student rail and header switcher (13.0). */
export function groupStudentsByYear(students: StudentRailEntry[]): RailGroup[] {
  const byYear = new Map<number, StudentRailEntry[]>();
  for (const s of students) {
    const list = byYear.get(s.graduation_year) ?? [];
    list.push(s);
    byYear.set(s.graduation_year, list);
  }
  return Array.from(byYear.keys())
    .sort((a, b) => a - b)
    .map((year) => ({
      key: String(year),
      label: `Class of ${year}`,
      items: byYear.get(year)!.map((s) => ({
        id: s.id,
        label: `${s.first_name} ${s.last_name}`,
        hint:
          s.status !== "active"
            ? (STUDENT_STATUS_LABELS[s.status] ?? s.status)
            : null,
      })),
    }));
}

/**
 * Households grouped by the class year of their soonest-graduating student
 * (the cycle the family is engaged for); households with no students yet
 * sit in a trailing group.
 */
export function groupFamiliesByYear(families: FamilyRailEntry[]): RailGroup[] {
  const byYear = new Map<number | null, FamilyRailEntry[]>();
  for (const f of families) {
    const list = byYear.get(f.graduation_year) ?? [];
    list.push(f);
    byYear.set(f.graduation_year, list);
  }
  const years = Array.from(byYear.keys())
    .filter((y): y is number => y !== null)
    .sort((a, b) => a - b);
  const groups: RailGroup[] = years.map((year) => ({
    key: String(year),
    label: `Class of ${year}`,
    items: byYear.get(year)!.map(toFamilyItem),
  }));
  const none = byYear.get(null);
  if (none && none.length > 0) {
    groups.push({ key: "none", label: "No students yet", items: none.map(toFamilyItem) });
  }
  return groups;
}

function toFamilyItem(f: FamilyRailEntry) {
  return {
    id: f.id,
    label: f.household_name,
    hint:
      f.student_count > 1 ? `${f.student_count} students` : null,
  };
}
