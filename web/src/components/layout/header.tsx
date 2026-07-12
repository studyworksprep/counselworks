"use client";

import { UserButton } from "@clerk/nextjs";
import { NotificationBell } from "./notification-bell";

interface HeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function Header({ title, description, actions }: HeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white px-4 py-4 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-4">
          {actions}
          <NotificationBell />
          <UserButton />
        </div>
      </div>
    </header>
  );
}
