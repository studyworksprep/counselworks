"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { formatDate } from "@/lib/utils";
import { updateStudentProfile } from "@/lib/actions/profile";
import {
  TestingAndPreferenceFields,
  FinancialFields,
  TestingRowsEditor,
  ActivitiesRowsEditor,
  AwardsRowsEditor,
  type ProfileValues,
} from "@/components/profile/profile-fields";

/**
 * Counselor-facing profile & preferences card: the write path for every
 * field the recommendation scorer and fit analysis read, plus intake status.
 */
export function ProfileCard({
  studentId,
  profile,
  intakeSubmittedAt,
}: {
  studentId: string;
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
      const result = await updateStudentProfile(studentId, formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const geo = (profile.geographic_preferences ?? []).join(", ");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Profile & Preferences</h3>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-gray-500">Best SAT</dt>
            <dd className="font-medium text-gray-900">
              {profile.sat_score ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Best ACT</dt>
            <dd className="font-medium text-gray-900">
              {profile.act_score ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Geography</dt>
            <dd className="font-medium text-gray-900">{geo || "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">School type</dt>
            <dd className="font-medium capitalize text-gray-900">
              {profile.target_school_type ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Budget</dt>
            <dd className="font-medium text-gray-900">
              {profile.budget_range ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Aid interest</dt>
            <dd className="font-medium capitalize text-gray-900">
              {profile.financial_aid_interest ?? "—"}
              {profile.financial_aid_needed ? " (need-based required)" : ""}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-gray-500">Citizenship</dt>
            <dd className="font-medium text-gray-900">
              {profile.citizenship_status ?? "—"}
            </dd>
          </div>
        </dl>
        <div className="mt-3 border-t border-gray-100 pt-3">
          {intakeSubmittedAt ? (
            <Badge variant="success">
              Intake submitted {formatDate(intakeSubmittedAt)}
            </Badge>
          ) : (
            <Badge variant="warning">Intake not yet submitted</Badge>
          )}
        </div>
      </CardContent>

      <Modal
        open={open}
        onClose={() => !isPending && setOpen(false)}
        title="Edit profile & preferences"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert>{error}</Alert>
          )}
          <TestingAndPreferenceFields values={profile} />
          <FinancialFields values={profile} />
          <TestingRowsEditor initial={profile.testing_summary_json} />
          <ActivitiesRowsEditor initial={profile.activities_json} />
          <AwardsRowsEditor initial={profile.awards_json} />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Profile"}
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
