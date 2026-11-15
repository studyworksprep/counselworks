import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import {
  getApplicationReadiness,
  getInterviewStudents,
} from "@/lib/db/queries";
import { ApplicationReadiness } from "@/components/readiness/application-readiness";

export default async function StudentReadinessPage() {
  const students = await getInterviewStudents();
  const data = students[0]
    ? await getApplicationReadiness(students[0].id)
    : null;
  if (!data || data.surface !== "student") return notFound();
  return (
    <PageShell
      title="Application readiness"
      description="See deadlines and the work connected to each college."
    >
      <ApplicationReadiness data={data} />
    </PageShell>
  );
}
