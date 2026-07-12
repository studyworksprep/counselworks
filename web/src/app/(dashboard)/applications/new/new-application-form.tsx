"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { createApplication } from "@/lib/actions/applications";
import { APPLICATION_ROUNDS } from "@/lib/constants/applications";

const applicationTypes = APPLICATION_ROUNDS.map((r) => ({
  value: r.value,
  label: r.label,
}));

interface Props {
  students: { id: string; name: string }[];
  colleges: { id: string; name: string }[];
  initialStudentId?: string | null;
  initialCollegeId?: string | null;
}

export function NewApplicationForm({
  students,
  colleges,
  initialStudentId,
  initialCollegeId,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await createApplication(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else if ("id" in result) {
      router.push("/applications");
    }
  }

  return (
    <PageShell
      title="Add Application"
      description="Track a new college application for a student"
    >
      <Card className="max-w-2xl">
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert>{error}</Alert>
            )}

            <Select
              name="student_id"
              label="Student"
              required
              placeholder="Select a student"
              defaultValue={initialStudentId ?? ""}
              options={students.map((s) => ({
                value: s.id,
                label: s.name,
              }))}
            />

            <Select
              name="college_id"
              label="College"
              required
              placeholder="Select a college"
              defaultValue={initialCollegeId ?? ""}
              options={colleges.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />

            <Select
              name="application_type"
              label="Application Type"
              required
              placeholder="Select type"
              options={applicationTypes}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Deadline
              </label>
              <Input name="deadline_at" type="date" />
              <p className="mt-1 text-xs text-gray-500">
                Leave blank to use the round&apos;s default deadline for the
                student&apos;s class year (configurable in Settings; editable
                afterwards).
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={loading}>
                Create Application
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
