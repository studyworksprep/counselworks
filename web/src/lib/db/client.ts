import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — BYPASSES Row Level Security entirely.
 *
 * Allowlisted call sites ONLY (see CLAUDE.md security rules):
 *   - the Clerk webhook (src/app/api/webhooks/clerk)
 *   - Inngest background jobs (src/lib/queue/functions.ts)
 *   - identity provisioning & invitation claiming (src/lib/auth/resolve.ts,
 *     src/lib/actions/invitations.ts, staff invites in settings.ts)
 *   - storage signing/uploads after app-layer authorization (src/lib/storage)
 *   - College Scorecard catalog sync (global `colleges` table has no client
 *     write policies by design)
 *   - ICS calendar feed (src/app/api/calendar-feed/[token]): external
 *     calendar apps present only the secret token — no Clerk session exists
 *     to scope a user client; the handler firm-scopes every query
 *
 * Every other read/write goes through getDb(). Do not add a call site
 * without documenting here why RLS cannot apply. The canonical, fuller
 * allowlist lives in docs/SECURITY.md.
 */
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

let userClient: SupabaseClient | null = null;

/**
 * User-scoped client: every request carries the caller's Clerk session token,
 * so Postgres runs queries as the `authenticated` role and RLS policies
 * (migration 00016) enforce tenancy and coarse role gates.
 *
 * Requires the Supabase project to have Clerk registered as a third-party
 * auth provider and Clerk sessions to carry the `role: "authenticated"`
 * claim — see docs/SECURITY.md for the rollout steps.
 *
 * A singleton is safe here: supabase-js invokes the accessToken callback for
 * each outgoing request, inside the calling request's async context, so
 * Clerk's auth() resolves the right session per request.
 */
export function createUserClient(): SupabaseClient {
  if (userClient) return userClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!anonKey) {
    throw new Error(
      "Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  userClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    accessToken: async () => {
      // Dynamic import keeps this module importable outside a server
      // request context (e.g. vitest).
      const { auth } = await import("@clerk/nextjs/server");
      const { getToken } = await auth();
      return (await getToken()) ?? null;
    },
  });

  return userClient;
}

/**
 * The client for all user-initiated reads and writes.
 *
 * Rollout flag: until the Supabase project is configured for Clerk
 * third-party auth (docs/SECURITY.md), SUPABASE_USER_SCOPED_DB stays unset
 * and this falls back to the service-role client — application-layer
 * authorization (src/lib/auth/authorize.ts) is then the only enforcement,
 * exactly as before. Once the flag is "true", RLS enforces tenancy
 * underneath the app checks as defense in depth.
 */
export function getDb(): SupabaseClient {
  if (process.env.SUPABASE_USER_SCOPED_DB === "true") {
    return createUserClient();
  }
  return createServerClient();
}

/**
 * Create a Supabase client for browser-side usage (Client Components).
 * Uses the anon key which respects Row Level Security policies.
 */
export function createBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!anonKey) {
    throw new Error(
      "Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return createClient(url, anonKey);
}
