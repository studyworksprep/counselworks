/**
 * White-label wrapper (fix plan 9.2): overrides the primary color tokens
 * (which every `primary-*` utility reads as CSS variables) with the firm's
 * configured brand color. Shades derive via color-mix so one hex is enough.
 */
export function FirmTheme({
  primaryColor,
  children,
}: {
  primaryColor: string | null;
  children: React.ReactNode;
}) {
  const style = primaryColor
    ? ({
        "--color-primary-50": `color-mix(in srgb, ${primaryColor} 8%, white)`,
        "--color-primary-100": `color-mix(in srgb, ${primaryColor} 14%, white)`,
        "--color-primary-200": `color-mix(in srgb, ${primaryColor} 28%, white)`,
        "--color-primary-300": `color-mix(in srgb, ${primaryColor} 45%, white)`,
        "--color-primary-400": `color-mix(in srgb, ${primaryColor} 70%, white)`,
        "--color-primary-500": `color-mix(in srgb, ${primaryColor} 88%, white)`,
        "--color-primary-600": primaryColor,
        "--color-primary-700": `color-mix(in srgb, ${primaryColor} 85%, black)`,
        "--color-primary-800": `color-mix(in srgb, ${primaryColor} 70%, black)`,
        "--color-primary-900": `color-mix(in srgb, ${primaryColor} 55%, black)`,
        "--color-sidebar-active": primaryColor,
      } as React.CSSProperties)
    : undefined;

  return (
    <div style={style} className="min-h-screen">
      {children}
    </div>
  );
}
