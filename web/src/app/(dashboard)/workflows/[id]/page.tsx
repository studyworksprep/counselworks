import { notFound } from "next/navigation";
import {
  getWorkflowTemplateWithSteps,
  getStudentsForSelect,
} from "@/lib/db/queries";
import { TemplateDetailClient } from "./template-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function WorkflowTemplateDetailPage({ params }: Props) {
  const { id } = await params;
  const [template, students] = await Promise.all([
    getWorkflowTemplateWithSteps(id),
    getStudentsForSelect(),
  ]);

  if (!template) notFound();

  return <TemplateDetailClient template={template} students={students} />;
}
