"use client";

import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./notification-bell";
import { areaIconForPath } from "./nav-config";
import { Icon, type IconName } from "@/components/ui/icon";

interface HeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /**
   * The area icon beside the title. Defaults to the icon of the sidebar
   * area the page sits in (nav-config.ts), so the glyph a person clicked
   * titles the page they land on; pass a name to override, or false for
   * none.
   */
  icon?: IconName | false;
}

export function Header({ title, description, actions, icon }: HeaderProps) {
  const pathname = usePathname();
  const areaIcon = icon === false ? null : (icon ?? areaIconForPath(pathname));
  return (
    <header className="border-b border-gray-200 bg-white px-4 py-4 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 max-w-full items-center gap-3.5 [overflow-wrap:anywhere]">
          {areaIcon && (
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100 sm:flex">
              <Icon name={areaIcon} className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-gray-500">{description}</p>
            )}
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-4">
          {actions}
          <NotificationBell />
          <UserButton />
        </div>
      </div>
    </header>
  );
}
