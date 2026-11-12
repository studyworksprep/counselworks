import { parseChecklist } from "@/lib/constants/applications";
/** Read the existing application checklist; portal viewing creates no second state. */
export function ApplicationChecklistSummary({ value, headingLevel = 4 }: { value: unknown; headingLevel?: 3 | 4 }) {
  const items = parseChecklist(value) ?? [];
  const Heading = headingLevel === 3 ? "h3" : "h4";
  return <section className="mt-4 border-t pt-3">
    <Heading className="text-sm font-semibold">Application checklist</Heading>
    {items.length ? <ul className="mt-2 space-y-2 text-sm">{items.map(item => <li key={item.key}>
      <span aria-label={item.done ? "Complete" : "To do"}>{item.done ? "✓" : "○"}</span> {item.label}
    </li>)}</ul> : <p className="mt-2 text-sm text-gray-500">Your counselor has not set up a checklist yet.</p>}
  </section>;
}
