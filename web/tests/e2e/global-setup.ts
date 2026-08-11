import { clerkSetup } from "@clerk/testing/playwright";
import { e2eEnv } from "./helpers/env";

/**
 * Obtains a Clerk testing token (bypasses bot protection) when the dev
 * instance keys are configured. Without keys the golden-path suite
 * self-skips, so setup is a no-op and the runner stays green.
 */
export default async function globalSetup() {
  if (!e2eEnv()) {
    // A silently-skipped gate reports green and is indistinguishable from a
    // passing one — which is how this suite stayed dormant through Phases
    // 8-11. Any environment that means to run it live sets
    // E2E_REQUIRE_LIVE=true (CI's `e2e` job does), turning a misnamed or
    // missing secret into a red build instead of a false green.
    if (process.env.E2E_REQUIRE_LIVE === "true") {
      throw new Error(
        "[e2e] E2E_REQUIRE_LIVE=true but Clerk test-auth env is missing " +
          "(need CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY or " +
          "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY). Refusing to skip the " +
          "regression gate — see docs/E2E.md."
      );
    }
    console.warn(
      "[e2e] CLERK_SECRET_KEY / publishable key not set — golden-path suite will be skipped (see docs/E2E.md)."
    );
    return;
  }
  await clerkSetup({
    publishableKey:
      process.env.CLERK_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
}
