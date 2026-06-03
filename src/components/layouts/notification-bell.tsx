"use client";

import { cn } from "@/utils/cn";
import type { UseNotificationsResult } from "@/lib/roles/role-config";

interface Props {
  useNotificationsHook: (limit: number) => UseNotificationsResult;
  isOpen: boolean;
  onToggle: () => void;
}

export function NotificationBell({ useNotificationsHook, isOpen, onToggle }: Props) {
  const { data } = useNotificationsHook(5);
  const count = data?.recentCount || 0;

  return (
    <button
      onClick={onToggle}
      className={cn(
        "relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
        isOpen ? "bg-white/[0.12]" : "hover:bg-white/[0.06]"
      )}
      aria-label="Уведомления"
    >
      <svg
        className="w-4.5 h-4.5 text-white/60"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-red text-white text-2xs font-bold flex items-center justify-center">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
