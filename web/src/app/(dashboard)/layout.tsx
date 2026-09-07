import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AppShell } from "@/components/layout/app-shell";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { getUnreadMessageCount, getFirmBranding } from "@/lib/db/queries";
import { FirmTheme } from "@/components/brand/firm-theme";
import { readLayoutPrefs } from "@/lib/ui/layout-prefs.server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await resolveUserAndFirm();

  if (!ctx) {
    // Authenticated but unaffiliated users choose their path on /welcome
    // (fix plan 2.2) — firms are never provisioned implicitly.
    const { userId } = await auth();
    redirect(userId ? "/welcome" : "/sign-in");
  }

  // Redirect students to their portal
  if (ctx.role === "student") {
    redirect("/student-dashboard");
  }

  // Redirect parents/guardians to the family portal
  if (ctx.role === "parent_guardian") {
    redirect("/family-dashboard");
  }

  const [unreadCount, branding, prefs] = await Promise.all([
    getUnreadMessageCount(),
    getFirmBranding(),
    readLayoutPrefs(),
  ]);

  return (
    <FirmTheme primaryColor={branding.primaryColor}>
      <AppShell
        variant="staff"
        role={ctx.role}
        unreadCount={unreadCount}
        branding={branding}
        sidebarCollapsed={prefs.sidebarCollapsed}
      >
        {children}
      </AppShell>
    </FirmTheme>
  );
}
