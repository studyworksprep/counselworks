/**
 * family_members.relationship_type — one spelling for the add-member form,
 * the member row editor, the CSV importer, and the family page label
 * (CLAUDE.md rule 4).
 */
export const FAMILY_RELATIONSHIP_OPTIONS = [
  { value: "parent", label: "Parent" },
  { value: "guardian", label: "Guardian" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
] as const;

export const FAMILY_RELATIONSHIP_VALUES = FAMILY_RELATIONSHIP_OPTIONS.map(
  (o) => o.value
);

export const FAMILY_RELATIONSHIP_LABELS: Record<string, string> =
  Object.fromEntries(FAMILY_RELATIONSHIP_OPTIONS.map((o) => [o.value, o.label]));
