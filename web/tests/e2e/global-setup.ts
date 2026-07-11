import { clerkSetup } from "@clerk/testing/playwright";
import { e2eEnv } from "./helpers/env";

/**
 * Obtains a Clerk testing token (bypasses bot protection) when the dev
 * instance keys are configured. Without keys the golden-path suite
 * self-skips, so setup is a no-op and the runner stays green.
 */
export default async function globalSetup() {
  if (!e2eEnv()) {
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
