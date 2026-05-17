"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useOwnerAuthStore, useOwnerUser } from "@/stores/owner-auth-store";
import { Button } from "@/components/ui";
import { cn } from "@/utils/cn";

export default function OwnerSettingsPage() {
  const router = useRouter();
  const user = useOwnerUser();
  const { logout } = useOwnerAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace("/owner/login");
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white mb-1">Настройки</h1>
        <p className="text-white/60">Профиль и система</p>
      </motion.div>

      {/* Profile section */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-3"
      >
        <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider px-1">Профиль</h2>
        <div
          className={cn(
            "rounded-2xl overflow-hidden",
            "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
            "border border-glass",
            "shadow-card"
          )}
        >
          {/* Avatar + Name */}
          <div className="flex items-center gap-4 px-4 py-4 border-b border-glass-minimal">
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center",
                "bg-gradient-to-br from-purple-500/20 to-purple-500/10",
                "border border-purple-500/25",
                "shadow-[0_0_16px_rgba(191,90,242,0.2)]"
              )}
            >
              <span className="text-xl font-semibold text-white">
                {(user?.name || "O").charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-white">{user?.name || "Владелец"}</p>
              <p className="text-sm text-white/40">Администратор системы</p>
            </div>
          </div>

          {/* Info items */}
          {user?.email && <SettingsInfoItem label="Email" value={user.email} />}
          {user?.telegramUsername && (
            <SettingsInfoItem label="Telegram" value={`@${user.telegramUsername}`} />
          )}
          <SettingsInfoItem label="Роль" value="Владелец" isLast />
        </div>
      </motion.section>

      {/* System section */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-3"
      >
        <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider px-1">Система</h2>
        <div
          className={cn(
            "rounded-2xl overflow-hidden",
            "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
            "border border-glass",
            "shadow-card"
          )}
        >
          <SettingsInfoItem label="Версия" value="1.0.0" />
          <SettingsInfoItem label="Платформа" value="Next.js + Supabase" />
          <SettingsInfoItem label="Дизайн" value="iOS 26 Liquid Glass" isLast />
        </div>
      </motion.section>

      {/* Logout */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Button variant="danger" size="lg" className="w-full" onClick={handleLogout}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Выйти из аккаунта
        </Button>
      </motion.div>
    </div>
  );
}

function SettingsInfoItem({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-3",
        !isLast && "border-b border-glass-minimal"
      )}
    >
      <span className="text-sm text-white/60">{label}</span>
      <span className="text-sm text-white font-medium">{value}</span>
    </div>
  );
}
