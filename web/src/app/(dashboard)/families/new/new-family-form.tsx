"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { createFamily } from "@/lib/actions/families";

export function NewFamilyForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await createFamily(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else if ("id" in result) {
      router.push(`/families/${result.id}`);
    }
  }

  return (
    <PageShell title="Add Family" description="Create a new family household">
      <Card className="max-w-2xl">
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert>{error}</Alert>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Household Name *
              </label>
              <Input
                name="household_name"
                required
                placeholder='e.g. "The Smith Family"'
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <Input name="address_line1" placeholder="Street address" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City
                </label>
                <Input name="city" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State
                </label>
                <Input name="state_region" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ZIP Code
                </label>
                <Input name="postal_code" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={loading}>
                Create Family
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
