"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createWorkflowTemplate } from "@/lib/actions/workflows";

const WORKFLOW_TYPE_OPTIONS = [
  { value: "application", label: "Application cycle" },
  { value: "essay", label: "Essay process" },
  { value: "testing", label: "Testing & prep" },
  { value: "financial_aid", label: "Financial aid" },
  { value: "general", label: "General" },
];

export default function NewWorkflowTemplatePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await createWorkflowTemplate(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else if ("id" in result) {
      router.push(`/workflows/${result.id}`);
    }
  }

  return (
    <PageShell
      title="New Workflow Template"
      description="Define a reusable plan you can apply to a student"
    >
      <Card className="max-w-2xl">
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Input
              name="name"
              label="Name *"
              required
              placeholder='e.g. "Senior Year Application Cycle"'
            />

            <Textarea
              name="description"
              label="Description"
              rows={3}
              placeholder="What does this workflow guide students through?"
            />

            <div className="grid grid-cols-2 gap-4">
              <Select
                name="workflow_type"
                label="Type *"
                required
                placeholder="Select a type"
                options={WORKFLOW_TYPE_OPTIONS}
              />
              <Input
                name="category"
                label="Category"
                placeholder="e.g. Junior, Senior"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Template"}
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
