import { redirect } from "next/navigation";
import { StudentSidebar } from "@/components/layout/student-sidebar";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { getUnreadMessageCount, getFirmBranding } from "@/lib/db/queries";
import { FirmTheme } from "@/components/brand/firm-theme";

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

  const [unreadCount, branding] = await Promise.all([
    getUnreadMessageCount(),
    getFirmBranding(),
  ]);

  return (
    <FirmTheme primaryColor={branding.primaryColor}>
      <StudentSidebar unreadCount={unreadCount} branding={branding} />
      <div className="ml-64">{children}</div>
    </FirmTheme>
  );
}
