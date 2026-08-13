import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Routes with no Clerk session by design. Each authenticates itself — being
// listed here means "Clerk does not gate this", never "unauthenticated".
//   /api/webhooks      — Svix signature (Clerk webhook secret)
//   /api/inngest       — Inngest request signing (INNGEST_SIGNING_KEY). Without
//                        this entry Inngest Cloud's sync and every cron
//                        invocation is redirected to /sign-in, so no scheduled
//                        job can ever run in a deployed environment.
//   /api/calendar-feed — secret 48-hex per-counselor token in the path, with a
//                        firm-wide kill switch (fix plan 11.5). External
//                        calendar apps cannot hold a Clerk session at all.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/inngest(.*)",
  "/api/calendar-feed(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();

  // Authenticated users hitting sign-in/sign-up should go to dashboard
  if (userId && (request.nextUrl.pathname.startsWith("/sign-in") || request.nextUrl.pathname.startsWith("/sign-up"))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Protect non-public routes
  if (!isPublicRoute(request)) {
    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
  }
}, {
  // Tolerate clock drift between the token-minting client and this server.
  // Clerk's default (5s) intermittently rejected a just-refreshed session
  // token whose iat sat ahead of the CI VM's clock: exactly one request went
  // out "signed out" (a 307 on an RSC fetch that cannot handshake) while the
  // requests around it were fine — observed twice in the golden-path E2E,
  // once bouncing a post-redirect navigation and once eating a post-write
  // router.refresh(). 60s is a common, safe tolerance.
  clockSkewInMs: 60_000,
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
