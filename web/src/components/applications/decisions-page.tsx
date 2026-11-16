import { notFound } from "next/navigation";
import { getApplicationDecisions } from "@/lib/db/queries";
import { ApplicationDecisions } from "./decisions";
export async function ApplicationDecisionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    data = await getApplicationDecisions(id);
  if (!data) notFound();
  return <ApplicationDecisions key={id} initialData={data} />;
}
