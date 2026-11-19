import { ArrowLink } from "@/components/ui/arrow-link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { getApplicationReadiness } from "@/lib/db/queries";
import { ApplicationReadiness } from "@/components/readiness/application-readiness";

export default async function FamilyReadinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getApplicationReadiness(id);
  if (!data || data.surface !== "family") return notFound();
  return (
    <PageShell
      title={`Application readiness · ${data.student.name}`}
      description="Deadlines and work shared with your family."
    >
      <div className="space-y-5">
        <ArrowLink back href="/family-readiness">
          Choose another student
        </ArrowLink>
        <ApplicationReadiness data={data} />
      </div>
    </PageShell>
  );
}
