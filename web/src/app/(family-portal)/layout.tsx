import { redirect } from "next/navigation";
import { FamilySidebar } from "@/components/layout/family-sidebar";
import { resolveUserAndFirm } from "@/lib/auth/resolve";

export default async function FamilyPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await resolveUserAndFirm();

  if (!ctx) redirect("/sign-in");
  if (ctx.role !== "parent_guardian") redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <FamilySidebar />
      <div className="ml-64">{children}</div>
    </div>
  );
}
