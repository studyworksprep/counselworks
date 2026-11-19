import { Header } from "./header";
import type { IconName } from "@/components/ui/icon";

interface PageShellProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Header icon override; defaults to the page's sidebar area (Header). */
  icon?: IconName | false;
  children: React.ReactNode;
}

export function PageShell({
  title,
  description,
  actions,
  icon,
  children,
}: PageShellProps) {
  return (
    <>
      <Header title={title} description={description} actions={actions} icon={icon} />
      <main className="p-4 sm:p-8">{children}</main>
    </>
  );
}
