import { getFamilies } from "@/lib/db/queries";
import { FamiliesClient } from "./families-client";

interface Props {
  searchParams: Promise<{ search?: string }>;
}

export default async function FamiliesPage({ searchParams }: Props) {
  const params = await searchParams;
  const families = await getFamilies({ search: params.search });
  return <FamiliesClient families={families} />;
}
