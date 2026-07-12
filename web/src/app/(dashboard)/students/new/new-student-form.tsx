"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createStudent } from "@/lib/actions/students";

export function NewStudentForm({
  initialFamilyId,
}: {
  initialFamilyId?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [families, setFamilies] = useState<
    Array<{ id: string; household_name: string }>
  >([]);

  useEffect(() => {
    fetch("/api/families")
      .then((res) => res.json())
      .then((data) => setFamilies(data.families ?? []))
      .catch(() => {});
  }, []);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => ({
    value: String(currentYear + i),
    label: `Class of ${currentYear + i}`,
  }));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await createStudent(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else if ("id" in result) {
      router.push(`/students/${result.id}`);
    }
  }

  return (
    <PageShell title="Add Student" description="Create a new student record">
      <Card className="max-w-2xl">
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <Input name="first_name" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name *
                </label>
                <Input name="last_name" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Graduation Year *
                </label>
                <Select
                  name="graduation_year"
                  options={yearOptions}
                  placeholder="Select year"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Family *
                </label>
                <Select
                  name="family_id"
                  key={families.length > 0 ? "loaded" : "loading"}
                  defaultValue={initialFamilyId ?? ""}
                  options={families.map((f) => ({
                    value: f.id,
                    label: f.household_name,
                  }))}
                  placeholder="Select family"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                School Name
              </label>
              <Input name="school_name" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Student"}
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
