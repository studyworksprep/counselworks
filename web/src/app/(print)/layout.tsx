import { redirect } from "next/navigation";
import { resolveUserAndFirm } from "@/lib/auth/resolve";

export default async function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) redirect("/sign-in");
  // Bare layout — no sidebar, no header. The page renders the printable view.
  return <div className="min-h-screen bg-white text-gray-900">{children}</div>;
}
