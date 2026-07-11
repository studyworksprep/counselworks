import { notFound } from "next/navigation";
import { getApplicationById } from "@/lib/db/queries";
import { ApplicationDetailClient } from "./application-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ApplicationDetailPage({ params }: Props) {
  const { id } = await params;
  const application = await getApplicationById(id);
  if (!application) return notFound();

  return <ApplicationDetailClient application={application} />;
}
