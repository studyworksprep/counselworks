"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createApplication } from "@/lib/actions/applications";

const applicationTypes = [
  { value: "regular", label: "Regular Decision" },
  { value: "early_action", label: "Early Action" },
  { value: "early_decision", label: "Early Decision" },
  { value: "early_decision_ii", label: "Early Decision II" },
  { value: "rolling", label: "Rolling" },
  { value: "restrictive_early_action", label: "Restrictive Early Action" },
];

interface Props {
  students: { id: string; name: string }[];
  colleges: { id: string; name: string }[];
}

export function NewApplicationForm({ students, colleges }: Props) {
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
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Select
              name="student_id"
              label="Student *"
              required
              placeholder="Select a student"
              options={students.map((s) => ({
                value: s.id,
                label: s.name,
              }))}
            />

            <Select
              name="college_id"
              label="College *"
              required
              placeholder="Select a college"
              options={colleges.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />

            <Select
              name="application_type"
              label="Application Type *"
              required
              placeholder="Select type"
              options={applicationTypes}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Deadline
              </label>
              <Input name="deadline_at" type="date" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Application"}
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
