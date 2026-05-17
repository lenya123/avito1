"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useOwnerAuthStore } from "@/stores/owner-auth-store";
import { OwnerNavIcons } from "@/components/owner/nav-icons";
import { cn } from "@/utils/cn";

const menuItems = [
  {
    href: "/owner/ai-sales",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        <path d="M9 10h.01M12 10h.01M15 10h.01" strokeLinecap="round" />
      </svg>
    ),
    label: "AI Продажник",
    subtitle: "Автоответы покупателям",
    color: "accent-purple",
  },
  {
    href: "/owner/analytics",
    icon: <OwnerNavIcons.analytics />,
    label: "Аналитика",
    subtitle: "Статистика и графики",
    color: "accent-blue",
  },
  {
    href: "/owner/shippers",
    icon: <OwnerNavIcons.shippers />,
    label: "Отправщики",
    subtitle: "Управление командой",
    color: "accent-green",
  },
  {
    href: "/owner/settings",
    icon: <OwnerNavIcons.settings />,
    label: "Настройки",
    subtitle: "Профиль и система",
    color: "accent-orange",
  },
];

export default function OwnerMorePage() {
  const router = useRouter();
  const { logout } = useOwnerAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace("/owner/login");
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white mb-1">Ещё</h1>
        <p className="text-white/60">Дополнительные разделы</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={cn(
          "rounded-2xl overflow-hidden",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "border border-glass",
          "shadow-card"
        )}
      >
        {menuItems.map((item, index) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-4 px-4 py-4",
              "hover:bg-white/[0.04] transition-colors duration-200",
              index < menuItems.length - 1 && "border-b border-glass-minimal"
            )}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                "bg-gradient-to-br from-white/[0.12] to-white/[0.06]",
                "border border-glass-subtle"
              )}
            >
              <span className="w-5 h-5 text-white/80">{item.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{item.label}</p>
              <p className="text-xs text-white/40">{item.subtitle}</p>
            </div>
            <svg
              className="w-4 h-4 text-white/20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ))}
      </motion.div>

      {/* Logout */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl",
            "bg-accent-red/10 border border-accent-red/20",
            "text-accent-red font-medium text-sm",
            "hover:bg-accent-red/15 transition-colors duration-200"
          )}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Выйти из аккаунта
        </button>
      </motion.div>
    </div>
  );
}
