import { notFound } from "next/navigation";
import { getApplications, getStudentByIdCached } from "@/lib/db/queries";
import { ApplicationsClient } from "@/app/(dashboard)/applications/applications-client";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ search?: string; stage?: string; round?: string; due?: string }>;
}

/**
 * Student Applications (fix plan 13.0): the firm-wide Applications list,
 * pinned to this student — same component, same actions, the student
 * filter fixed and hidden. No second implementation to drift.
 */
export default async function StudentApplicationsPage({ params, searchParams }: Props) {
  const [{ id }, filters] = await Promise.all([params, searchParams]);
  const [student, applications] = await Promise.all([
    getStudentByIdCached(id),
    getApplications({
      search: filters.search,
      stage: filters.stage,
      round: filters.round,
      due: filters.due,
      studentId: id,
    }),
  ]);
  if (!student) return notFound();

  return (
    <ApplicationsClient
      applications={applications}
      students={[]}
      embed={{ studentId: id, basePath: `/students/${id}/applications` }}
    />
  );
}
