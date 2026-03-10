import { getApplications } from "@/lib/db/queries";
import { ApplicationsClient } from "./applications-client";

interface Props {
  searchParams: Promise<{ search?: string; stage?: string }>;
}

export default async function ApplicationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const applications = await getApplications({
    search: params.search,
    stage: params.stage,
  });

  return <ApplicationsClient applications={applications} />;
}
