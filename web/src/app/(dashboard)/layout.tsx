import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { resolveUserAndFirm } from "@/lib/auth/resolve";

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

  return (
    <div className="min-h-screen">
      <Sidebar role={ctx?.role ?? "counselor"} />
      <div className="ml-64">{children}</div>
    </div>
  );
}
