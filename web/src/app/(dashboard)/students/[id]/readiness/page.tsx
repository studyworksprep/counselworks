import { notFound } from "next/navigation";
import { getApplicationReadiness } from "@/lib/db/queries";
import { ApplicationReadiness } from "@/components/readiness/application-readiness";

export default async function StaffReadinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getApplicationReadiness(id);
  if (!data || data.surface !== "staff") return notFound();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Application readiness</h1>
        <p className="mt-1 text-sm text-gray-600">
          {data.student.name} · Fall {data.student.graduationYear}
        </p>
      </div>
      <ApplicationReadiness data={data} />
    </div>
  );
}
