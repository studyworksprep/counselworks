/**
 * Drop-in for PageShell inside a workspace that already renders the page
 * header (fix plan 13.0: the student workspace layout owns the header and
 * sub-navigation). Same props as PageShell so a list client can pick one
 * or the other; the title/description are provided by the workspace, so
 * only the actions row and the content render here.
 */
export function EmbeddedShell({
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      {actions && (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
