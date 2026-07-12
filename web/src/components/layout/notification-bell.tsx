"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getMyNotifications,
  markAllNotificationsRead,
  type NotificationRow,
} from "@/lib/actions/notifications";
import { formatDateTime } from "@/lib/utils";

/**
 * In-app notification feed (fix plan 10.4) — rendered in the header of all
 * three shells. Loads on mount and refreshes when opened.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  async function load() {
    const result = await getMyNotifications();
    setItems(result.notifications);
    setUnread(result.unread);
  }

  useEffect(() => {
    // Deferred so the async fetch never sets state synchronously in-effect.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await load();
      if (unread > 0) {
        await markAllNotificationsRead();
        setUnread(0);
      }
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={
          unread > 0 ? `Notifications (${unread} unread)` : "Notifications"
        }
        className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Notifications
          </p>
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-gray-400">
              Nothing yet.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => {
                const inner = (
                  <>
                    <p
                      className={`text-sm ${
                        n.read_at
                          ? "text-gray-600"
                          : "font-medium text-gray-900"
                      }`}
                    >
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="line-clamp-2 text-xs text-gray-500">
                        {n.body}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400">
                      {formatDateTime(n.created_at)}
                    </p>
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={() => setOpen(false)}
                        className="block rounded-lg px-2 py-2 hover:bg-gray-50"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="px-2 py-2">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
