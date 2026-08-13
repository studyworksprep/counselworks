import { redirect } from "next/navigation";
import {
  resolveAffiliation,
  findClientLinkageByEmail,
  type ClientLinkage,
} from "@/lib/auth/resolve";
import { WelcomeClient } from "./welcome-client";

/**
 * Landing for authenticated users with no firm affiliation (fix plan 2.2).
 * Three states:
 *  - email matches a client record a firm created → guided link
 *    ("{Firm} added you… link your account?")
 *  - otherwise → explicit "Create your firm" for counselors, plus concrete
 *    guidance for clients who signed up with a different address
 * Members and signed-out visitors never see this page.
 */
export default async function WelcomePage() {
  const affiliation = await resolveAffiliation();

  if (affiliation.status === "unauthenticated") redirect("/sign-in");
  if (affiliation.status === "member") {
    const role = affiliation.ctx.role;
    if (role === "student") redirect("/student-dashboard");
    if (role === "parent_guardian") redirect("/family-dashboard");
    redirect("/dashboard");
  }

  let linkage: ClientLinkage | null = null;
  if (affiliation.email) {
    linkage = await findClientLinkageByEmail(affiliation.email);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <WelcomeClient
        email={affiliation.email}
        linkage={
          linkage
            ? {
                kind: linkage.kind,
                firmName: linkage.firmName,
                householdName: linkage.householdName,
              }
            : null
        }
      />
    </main>
  );
}
