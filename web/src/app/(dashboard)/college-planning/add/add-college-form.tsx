"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { addStudentCollege } from "@/lib/actions/colleges";

interface Props {
  students: { id: string; name: string }[];
  colleges: { id: string; name: string }[];
}

export function AddCollegeForm({ students, colleges }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await addStudentCollege(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push("/college-planning");
    }
  }

  return (
    <PageShell
      title="Add to College List"
      description="Add a college to a student's research list"
    >
      <Card className="max-w-2xl">
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert>{error}</Alert>
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
              name="category"
              label="Category *"
              required
              placeholder="Select category"
              options={[
                { value: "safety", label: "Safety" },
                { value: "likely", label: "Likely" },
                { value: "target", label: "Target" },
                { value: "reach", label: "Reach" },
                { value: "far_reach", label: "Far Reach" },
              ]}
            />

            <Select
              name="round_type"
              label="Application Round"
              placeholder="Select round (optional)"
              options={[
                { value: "ea", label: "Early Action" },
                { value: "ed", label: "Early Decision" },
                { value: "ed2", label: "ED II" },
                { value: "rea", label: "REA" },
                { value: "rd", label: "Regular Decision" },
                { value: "rolling", label: "Rolling" },
              ]}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Intended Major
              </label>
              <Input name="intended_major" placeholder="e.g. Computer Science" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Adding..." : "Add to List"}
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
