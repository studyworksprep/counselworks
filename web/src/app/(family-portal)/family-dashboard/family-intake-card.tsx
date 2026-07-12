"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { formatDate } from "@/lib/utils";
import { submitParentIntake } from "@/lib/actions/profile";
import {
  FinancialFields,
  type ProfileValues,
} from "@/components/profile/profile-fields";

export interface FamilyIntakeChild {
  studentId: string;
  name: string;
  intakeSubmittedAt: string | null;
  financial: ProfileValues;
}

/**
 * Parent intake: family financials and citizenship per child — the parent
 * half of the onboarding questionnaire.
 */
export function FamilyIntakeCard({
  childProfiles,
}: {
  childProfiles: FamilyIntakeChild[];
}) {
  const [active, setActive] = useState<FamilyIntakeChild | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (childProfiles.length === 0) return null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!active) return;
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("student_id", active.studentId);
    startTransition(async () => {
      const result = await submitParentIntake(formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setActive(null);
      router.refresh();
    });
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <h3 className="font-semibold text-gray-900">Family Information</h3>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-gray-500">
          Budget, financial aid, and citizenship details help your counselor
          build the right college list.
        </p>
        <ul className="divide-y divide-gray-100">
          {childProfiles.map((child) => (
            <li
              key={child.studentId}
              className="flex items-center justify-between py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {child.name}
                </p>
                {child.intakeSubmittedAt ? (
                  <Badge variant="success" className="mt-1">
                    Updated {formatDate(child.intakeSubmittedAt)}
                  </Badge>
                ) : (
                  <Badge variant="warning" className="mt-1">
                    Not completed yet
                  </Badge>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setActive(child);
                }}
              >
                {child.intakeSubmittedAt ? "Update" : "Complete"}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>

      <Modal
        open={!!active}
        onClose={() => !isPending && setActive(null)}
        title={active ? `Family information — ${active.name}` : ""}
      >
        {active && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert>{error}</Alert>
            )}
            <FinancialFields values={active.financial} />
            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={isPending}>
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setActive(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
}
