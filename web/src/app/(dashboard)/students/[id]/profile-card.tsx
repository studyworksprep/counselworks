"use client";

import { useActionState, useEffect, useState } from "react";
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
  // Framework-managed submission (React 19 form action): the router applies
  // the action's revalidatePath payload itself — no manual router.refresh(),
  // no post-await state updates. The previous `startTransition(async …)`
  // shape intermittently lost the revalidated payload (stale page until a
  // hard reload).
  const [state, formAction, isPending] = useActionState(
    async (
      _prev: { error?: string; success?: boolean } | null,
      formData: FormData,
    ) => {
      const result = await updateStudentProfile(studentId, formData);
      return "error" in result && result.error
        ? { error: result.error }
        : { success: true };
    },
    null,
  );

  // Close only on success — an error keeps the modal open with the Alert,
  // which the golden-path E2E relies on as its success signal. Fires once
  // per submission (state identity changes per action). Deferred so the
  // close never sets state synchronously in-effect (repo lint convention).
  useEffect(() => {
    if (!state || state.error) return;
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [state]);

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
        <form action={formAction} className="space-y-4">
          {state?.error && (
            <Alert>{state.error}</Alert>
          )}
          <TestingAndPreferenceFields values={profile} />
          <FinancialFields values={profile} />
          <TestingRowsEditor initial={profile.testing_summary_json} />
          <ActivitiesRowsEditor initial={profile.activities_json} />
          <AwardsRowsEditor initial={profile.awards_json} />
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending}>
              Save Profile
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
