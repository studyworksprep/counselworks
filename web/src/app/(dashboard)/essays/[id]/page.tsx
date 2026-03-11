import { notFound } from "next/navigation";
import { getEssayDraftById } from "@/lib/db/queries";
import { EssayEditorClient } from "./essay-editor-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EssayDetailPage({ params }: Props) {
  const { id } = await params;
  const essay = await getEssayDraftById(id);

  if (!essay) return notFound();

  return <EssayEditorClient essay={essay} />;
}
