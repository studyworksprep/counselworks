import { redirect } from "next/navigation";
import { FamilySidebar } from "@/components/layout/family-sidebar";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { getUnreadMessageCount } from "@/lib/db/queries";

export default async function FamilyPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await resolveUserAndFirm();

  if (!ctx) redirect("/sign-in");
  if (ctx.role !== "parent_guardian") redirect("/dashboard");

  const unreadCount = await getUnreadMessageCount();

  return (
    <div className="min-h-screen">
      <FamilySidebar unreadCount={unreadCount} />
      <div className="ml-64">{children}</div>
    </div>
  );
}
