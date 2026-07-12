"use client";

import { Button } from "./button";

/**
 * Shared error boundary body (fix plan 8.1): a thrown query no longer
 * surfaces the raw framework error page. `reset` re-renders the segment.
 */
export function ErrorPage({
  reset,
  homeHref,
}: {
  reset: () => void;
  homeHref: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-danger-500">
        Something went wrong
      </p>
      <h1 className="mt-2 text-2xl font-bold text-gray-900">
        We couldn&apos;t load this page
      </h1>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        The error has been logged. Try again — if it keeps happening, head
        back to your dashboard.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button
          variant="outline"
          onClick={() => (window.location.href = homeHref)}
        >
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}

/** Shared 404 body for route groups. */
export function NotFoundPage({ homeHref }: { homeHref: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-gray-400">404</p>
      <h1 className="mt-2 text-2xl font-bold text-gray-900">
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        This record doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <div className="mt-6">
        <Button
          variant="outline"
          onClick={() => (window.location.href = homeHref)}
        >
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
