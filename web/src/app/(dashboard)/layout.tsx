import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { getUnreadMessageCount, getFirmBranding } from "@/lib/db/queries";
import { FirmTheme } from "@/components/brand/firm-theme";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await resolveUserAndFirm();

  // Redirect students to their portal
  if (ctx?.role === "student") {
    redirect("/student-dashboard");
  }

  // Redirect parents/guardians to the family portal
  if (ctx?.role === "parent_guardian") {
    redirect("/family-dashboard");
  }

  const [unreadCount, branding] = await Promise.all([
    getUnreadMessageCount(),
    getFirmBranding(),
  ]);

  return (
    <FirmTheme primaryColor={branding.primaryColor}>
      <AppShell
        variant="staff"
        role={ctx?.role ?? "counselor"}
        unreadCount={unreadCount}
        branding={branding}
      >
        {children}
      </AppShell>
    </FirmTheme>
  );
}
