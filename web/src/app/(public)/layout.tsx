/**
 * Bare layout for token-authorized public pages (fix plan 12.7). No shell,
 * no session: each page under here authenticates with the secret in its
 * URL (see src/middleware.ts) and renders the firm's branding itself.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-gray-50 text-gray-900">{children}</div>;
}
