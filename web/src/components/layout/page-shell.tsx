import { Header } from "./header";

interface PageShellProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({
  title,
  description,
  actions,
  children,
}: PageShellProps) {
  return (
    <>
      <Header title={title} description={description} actions={actions} />
      <main className="p-4 sm:p-8">{children}</main>
    </>
  );
}
