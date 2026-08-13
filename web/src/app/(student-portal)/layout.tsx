import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AppShell } from "@/components/layout/app-shell";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { getUnreadMessageCount, getFirmBranding } from "@/lib/db/queries";
import { FirmTheme } from "@/components/brand/firm-theme";

export default async function StudentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await resolveUserAndFirm();

  // Only students can access the student portal. Authenticated users with
  // no affiliation choose their path on /welcome (fix plan 2.2).
  if (!ctx) {
    const { userId } = await auth();
    redirect(userId ? "/welcome" : "/sign-in");
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
      <AppShell variant="student" unreadCount={unreadCount} branding={branding}>
        {children}
      </AppShell>
    </FirmTheme>
  );
}
