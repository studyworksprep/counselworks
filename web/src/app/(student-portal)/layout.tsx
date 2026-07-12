import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/layout/student-sidebar";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { getUnreadMessageCount } from "@/lib/db/queries";

export default async function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await resolveUserAndFirm();

  // Only students can access the student portal
  if (!ctx) {
    redirect("/sign-in");
  }

  if (ctx.role !== "student") {
    redirect("/dashboard");
  }

  const unreadCount = await getUnreadMessageCount();

  return (
    <div className="min-h-screen">
      <StudentSidebar unreadCount={unreadCount} />
      <div className="ml-64">{children}</div>
    </div>
  );
}
