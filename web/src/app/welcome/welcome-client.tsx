"use client";

import { useActionState, useState } from "react";
import { SignOutButton } from "@clerk/nextjs";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import {
  linkClientAccount,
  createFirmForCurrentUser,
} from "@/lib/actions/onboarding";

interface LinkageView {
  kind: "student" | "parent";
  firmName: string;
  householdName: string | null;
}

export function WelcomeClient({
  email,
  linkage,
}: {
  email: string | null;
  linkage: LinkageView | null;
}) {
  // "This isn't me" flips a linked visitor to the generic two-door screen.
  const [showGeneric, setShowGeneric] = useState(false);

  const [linkState, linkAction, isLinking] = useActionState(
    async () => {
      // On success the action redirects; only errors return.
      const result = await linkClientAccount();
      return result ?? null;
    },
    null,
  );

  const [createState, createAction, isCreating] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await createFirmForCurrentUser(formData);
      return result ?? null;
    },
    null,
  );

  if (linkage && !showGeneric) {
    return (
      <Card className="w-full max-w-lg">
        <CardHeader>
          <h1 className="text-lg font-semibold text-gray-900">
            Welcome to CounselWorks
          </h1>
        </CardHeader>
        <CardContent className="space-y-4">
          {linkState?.error && <Alert>{linkState.error}</Alert>}
          <p className="text-sm leading-relaxed text-gray-700">
            It looks like <strong>{linkage.firmName}</strong> added you to
            CounselWorks
            {linkage.householdName ? (
              <>
                {" "}
                as part of <strong>{linkage.householdName}</strong>&rsquo;s
                records
              </>
            ) : (
              <> as a student</>
            )}
            . Link your new account to {linkage.firmName} to see your{" "}
            {linkage.kind === "student" ? "student" : "family"} portal.
          </p>
          <form action={linkAction} className="space-y-3">
            <Button type="submit" loading={isLinking} className="w-full">
              Link my account to {linkage.firmName}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setShowGeneric(true)}
            className="block w-full text-center text-sm text-gray-500 hover:text-gray-700 hover:underline"
          >
            This isn&rsquo;t me
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <h1 className="text-lg font-semibold text-gray-900">
          Welcome to CounselWorks
        </h1>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">
            I&rsquo;m a college counselor
          </h2>
          <p className="mb-3 text-sm text-gray-600">
            Set up your firm to start managing families, students, and
            applications.
          </p>
          <form action={createAction} className="space-y-3">
            {createState?.error && <Alert>{createState.error}</Alert>}
            <Input
              name="firm_name"
              label="Firm name"
              placeholder="e.g. Summit College Counseling"
              required
            />
            <Button type="submit" loading={isCreating}>
              Create your firm
            </Button>
          </form>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">
            I&rsquo;m a student or family member
          </h2>
          <p className="text-sm leading-relaxed text-gray-600">
            {email ? (
              <>
                You signed up as <strong>{email}</strong>, which doesn&rsquo;t
                match any client records.
              </>
            ) : (
              <>Your account isn&rsquo;t connected to a counseling firm yet.</>
            )}{" "}
            Your counselor may have a different email address on file for you —
            sign out and sign up again with the address they use to reach you,
            or ask them to update your email in their records.
          </p>
          <div className="mt-3">
            <SignOutButton redirectUrl="/sign-in">
              <Button variant="outline" size="sm">
                Sign out
              </Button>
            </SignOutButton>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
