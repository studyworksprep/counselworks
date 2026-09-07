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
 * Households grouped alphabetically by first letter. A family has no
 * graduation year of its own; "who's in this cycle" is the student rail's
 * question. Names that don't start with a letter share a trailing "#" group.
 */
export function groupFamiliesAlphabetically(families: FamilyRailEntry[]): RailGroup[] {
  const byLetter = new Map<string, FamilyRailEntry[]>();
  for (const f of families) {
    const first = f.household_name.trim().charAt(0).toUpperCase();
    const key = /[A-Z]/.test(first) ? first : "#";
    const list = byLetter.get(key) ?? [];
    list.push(f);
    byLetter.set(key, list);
  }
  const letters = Array.from(byLetter.keys()).sort((a, b) =>
    a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)
  );
  return letters.map((letter) => ({
    key: letter,
    label: letter,
    items: byLetter
      .get(letter)!
      .slice()
      .sort((a, b) => a.household_name.localeCompare(b.household_name))
      .map(toFamilyItem),
  }));
}

function toFamilyItem(f: FamilyRailEntry) {
  return {
    id: f.id,
    label: f.household_name,
    hint:
      f.student_count > 1 ? `${f.student_count} students` : null,
  };
}
