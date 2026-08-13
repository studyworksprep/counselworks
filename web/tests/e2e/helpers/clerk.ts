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

/** Clerk's documented 429 backoff hint, in seconds, when it sends one. */
const DEFAULT_RETRY_AFTER_S = 10;
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Clerk's Backend API rate-limits, and CI runners share egress IPs, so 429 is
 * a normal condition rather than an error. Retry on 429 (and on 5xx, which is
 * equally transient), honouring Retry-After when present. Everything else
 * fails immediately — a 401 means the secret key is wrong and no amount of
 * waiting fixes it.
 */
async function clerkApi<T>(path: string, init?: RequestInit): Promise<T> {
  let lastBody = "";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${CLERK_API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (res.ok) return (await res.json()) as T;

    lastStatus = res.status;
    lastBody = await res.text();

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) break;

    const headerSeconds = Number(res.headers.get("retry-after"));
    const waitSeconds = Number.isFinite(headerSeconds) && headerSeconds > 0
      ? headerSeconds
      : DEFAULT_RETRY_AFTER_S * attempt; // linear backoff when unhinted
    console.warn(
      `[e2e] Clerk API ${path} → ${res.status}; retrying in ${waitSeconds}s ` +
        `(attempt ${attempt}/${MAX_ATTEMPTS})`
    );
    await sleep(waitSeconds * 1000);
  }

  throw new Error(
    `Clerk API ${path} → ${lastStatus} after ${MAX_ATTEMPTS} attempt(s): ${lastBody}`
  );
}

interface ClerkUser {
  id: string;
}

/**
 * Prefixes of the run-unique users the suites create (~5 per run: golden
 * path student + two parents, welcome-spec counselor + parent). The stable
 * staff logins (e2e-owner / e2e-counselor) are not run-suffixed and never
 * match these.
 */
const EPHEMERAL_EMAIL_PREFIXES = [
  "e2e-student-",
  "e2e-parent1-",
  "e2e-parent2-",
  "w-counselor-",
  "w-parent-",
];

/**
 * Old enough that a concurrently running suite's fresh users are never
 * touched; stale ones from finished runs always are.
 */
const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Delete leftover run-unique test users from the Clerk dev instance.
 *
 * Every suite run creates ~5 users that nothing deleted, and the dev
 * instance hard-caps at 100 users — on 2026-08-13 the gate went red with
 * "user quota exceeded" (403) once the cap filled, failing every PR's E2E
 * job regardless of its content. Runs from global setup, so the instance
 * self-heals before each suite; best-effort because a cleanup hiccup must
 * not fail the gate on its own.
 */
export async function cleanupStaleTestUsers(): Promise<void> {
  interface ClerkUserRecord {
    id: string;
    created_at: number; // epoch ms
    email_addresses?: { email_address: string }[];
  }
  try {
    // The 100-user cap guarantees one max-size page sees every user.
    const users = await clerkApi<ClerkUserRecord[]>(
      "/v1/users?limit=100&order_by=created_at"
    );
    const cutoff = Date.now() - STALE_AFTER_MS;
    const stale = users.filter(
      (u) =>
        u.created_at < cutoff &&
        (u.email_addresses ?? []).some(
          (e) =>
            e.email_address.includes("+clerk_test@") &&
            EPHEMERAL_EMAIL_PREFIXES.some((p) =>
              e.email_address.startsWith(p)
            )
        )
    );
    for (const u of stale) {
      await clerkApi(`/v1/users/${u.id}`, { method: "DELETE" });
      await sleep(150); // stay politely under the Backend API rate limit
    }
    if (stale.length > 0) {
      console.log(
        `[e2e] deleted ${stale.length} stale test user(s) from the Clerk dev instance`
      );
    }
  } catch (e) {
    console.warn(`[e2e] stale-user cleanup failed (continuing): ${e}`);
  }
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
