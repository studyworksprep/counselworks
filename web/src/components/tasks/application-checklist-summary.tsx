import { parseChecklist } from "@/lib/constants/applications";
import { Checklist } from "@/components/structure/checklist";

/** Read the existing application checklist; portal viewing creates no second state. */
export function ApplicationChecklistSummary({ value, headingLevel = 4 }: { value: unknown; headingLevel?: 3 | 4 }) {
  const items = parseChecklist(value) ?? [];
  const Heading = headingLevel === 3 ? "h3" : "h4";
  return (
    <section className="mt-4 border-t border-gray-100 pt-3">
      {items.length ? (
        <Checklist items={items} heading="Application checklist" headingLevel={Heading} />
      ) : (
        <>
          <Heading className="text-sm font-semibold text-gray-900">Application checklist</Heading>
          <p className="mt-2 text-sm text-gray-600">Your counselor has not set up a checklist yet.</p>
        </>
      )}
    </section>
  );
}
