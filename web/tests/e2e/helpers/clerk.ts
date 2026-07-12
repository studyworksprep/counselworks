import type { Page } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

/**
 * Clerk Backend API helpers for the golden-path suite (fix plan 7.10).
 *
 * Personas are provisioned as real users in the Clerk DEV instance via the
 * Backend API (idempotent), then signed in with @clerk/testing's
 * ticket-based signIn — no UI scraping of the Clerk widget, no emails.
 * The app's claim path (resolveUserAndFirm) links each first sign-in to its
 * pre-staged `invited_` placeholder row by email, exactly like a real
 * invitee who signs up with the invited address.
 */

const CLERK_API_URL = process.env.CLERK_API_URL ?? "https://api.clerk.com";

async function clerkApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLERK_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clerk API ${path} → ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

interface ClerkUser {
  id: string;
}

/** Create the Clerk user if it doesn't exist yet; returns the Clerk user id. */
export async function ensureClerkUser(
  email: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const existing = await clerkApi<ClerkUser[]>(
    `/v1/users?email_address=${encodeURIComponent(email)}`
  );
  if (existing.length > 0) return existing[0].id;

  const created = await clerkApi<ClerkUser>("/v1/users", {
    method: "POST",
    body: JSON.stringify({
      email_address: [email],
      first_name: firstName,
      last_name: lastName,
      skip_password_requirement: true,
    }),
  });
  return created.id;
}

/**
 * Sign this page's context in as the given (already existing) Clerk user
 * and land on `landingPath`.
 */
export async function signInAs(
  page: Page,
  email: string,
  landingPath = "/dashboard"
): Promise<void> {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto(landingPath);
}
