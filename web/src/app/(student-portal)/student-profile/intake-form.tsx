"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { formatDate } from "@/lib/utils";
import { submitStudentIntake } from "@/lib/actions/profile";
import {
  TestingAndPreferenceFields,
  TestingRowsEditor,
  ActivitiesRowsEditor,
  AwardsRowsEditor,
  type ProfileValues,
} from "@/components/profile/profile-fields";

/**
 * Student intake: scores, preferences, activities, and awards — the
 * onboarding questionnaire the counselor reviews on the student page.
 */
export function StudentIntakeForm({
  profile,
  intakeSubmittedAt,
}: {
  profile: ProfileValues;
  intakeSubmittedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await submitStudentIntake(formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3 py-1">
          <div>
            <p className="text-sm font-medium text-gray-900">
              Keep your profile up to date
            </p>
            <p className="text-xs text-gray-500">
              Your scores, activities, and preferences power your counselor&apos;s
              college matching.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {intakeSubmittedAt ? (
              <Badge variant="success">
                Updated {formatDate(intakeSubmittedAt)}
              </Badge>
            ) : (
              <Badge variant="warning">Not completed yet</Badge>
            )}
            <Button size="sm" onClick={() => setOpen(true)}>
              {intakeSubmittedAt ? "Update my info" : "Complete my profile"}
            </Button>
          </div>
        </div>
      </CardContent>

      <Modal
        open={open}
        onClose={() => !isPending && setOpen(false)}
        title="My profile"
        description="Share your scores, activities, and college preferences."
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert>{error}</Alert>
          )}
          <TestingAndPreferenceFields values={profile} />
          <TestingRowsEditor initial={profile.testing_summary_json} />
          <ActivitiesRowsEditor initial={profile.activities_json} />
          <AwardsRowsEditor initial={profile.awards_json} />
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending}>
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
