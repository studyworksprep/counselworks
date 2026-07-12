import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { resolveUserAndFirm } from "@/lib/auth/resolve";
import { getUnreadMessageCount, getFirmBranding } from "@/lib/db/queries";
import { FirmTheme } from "@/components/brand/firm-theme";

export default async function FamilyPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await resolveUserAndFirm();

  if (!ctx) redirect("/sign-in");
  if (ctx.role !== "parent_guardian") redirect("/dashboard");

  const [unreadCount, branding] = await Promise.all([
    getUnreadMessageCount(),
    getFirmBranding(),
  ]);

  return (
    <FirmTheme primaryColor={branding.primaryColor}>
      <AppShell variant="family" unreadCount={unreadCount} branding={branding}>
        {children}
      </AppShell>
    </FirmTheme>
  );
}
