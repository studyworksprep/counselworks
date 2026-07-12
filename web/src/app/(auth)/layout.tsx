import { Wordmark } from "@/components/brand/wordmark";

/**
 * Branded auth frame (fix plan 9.1): the Clerk widgets render inside a
 * consistent product identity instead of a bare gray page.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-10">
      <div className="mb-8">
        <Wordmark />
      </div>
      {children}
      <p className="mt-8 text-xs text-gray-400">
        The operations platform for college counseling firms
      </p>
    </div>
  );
}
