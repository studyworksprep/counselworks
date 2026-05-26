import { notFound } from "next/navigation";
import { getEssayDraftById } from "@/lib/db/queries";
import { isStaffRole, resolveUserAndFirm } from "@/lib/auth/resolve";
import { EssayEditorClient } from "./essay-editor-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EssayDetailPage({ params }: Props) {
  const { id } = await params;
  const [essay, ctx] = await Promise.all([
    getEssayDraftById(id),
    resolveUserAndFirm(),
  ]);

  if (!essay) return notFound();

  const canReview = !!ctx && isStaffRole(ctx.role);

  return <EssayEditorClient essay={essay} canReview={canReview} />;
}
