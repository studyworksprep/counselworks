import { notFound } from "next/navigation";
import { getStudentEssayById } from "@/lib/db/queries";
import { PortalEssayEditor } from "./portal-essay-editor";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StudentEssayPage({ params }: Props) {
  const { id } = await params;
  const essay = await getStudentEssayById(id);
  if (!essay) return notFound();

  return <PortalEssayEditor essay={essay} />;
}
