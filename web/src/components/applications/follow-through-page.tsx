import { notFound } from "next/navigation";
import { getApplicationFollowThrough } from "@/lib/db/queries";
import { ApplicationFollowThrough } from "./follow-through";
export async function ApplicationFollowThroughPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    data = await getApplicationFollowThrough(id);
  if (!data) notFound();
  return <ApplicationFollowThrough key={id} initialData={data} />;
}
