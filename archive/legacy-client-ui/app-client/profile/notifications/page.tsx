"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useNotificationSettings } from "@/hooks/use-notification-settings";
import { Toggle } from "@/components/ui";
import { cn } from "@/utils/cn";

// Конфигурация настроек уведомлений
const NOTIFICATION_OPTIONS = [
  {
    key: "orderStatus" as const,
    title: "Статус заказов",
    description: "Уведомления об отправке, доставке и возвратах",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    ),
  },
  {
    key: "newProducts" as const,
    title: "Новые поступления",
    description: "Уведомления о новых товарах в каталоге",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
        />
      </svg>
    ),
  },
  {
    key: "promotions" as const,
    title: "Акции и новости",
    description: "Специальные предложения и обновления системы",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
        />
      </svg>
    ),
  },
];

export default function NotificationsPage() {
  const router = useRouter();
  const { settings, toggleSetting, isUpdating } = useNotificationSettings();

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/60 hover:text-white/80 transition-colors mb-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span className="text-sm">Назад</span>
        </button>
        <h1 className="text-2xl font-bold text-white">Уведомления</h1>
        <p className="text-sm text-white/60 mt-1">
          Настройте, какие уведомления вы хотите получать в Telegram
        </p>
      </motion.div>

      {/* Notification settings */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={cn(
          "relative rounded-2xl overflow-hidden",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "border border-glass",
          "shadow-card"
        )}
      >
        {/* Декоративный блик */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <div className="divide-y divide-glass-subtle">
          {NOTIFICATION_OPTIONS.map((option, index) => (
            <motion.div
              key={option.key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + index * 0.05 }}
              className="flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    "bg-gradient-to-br from-white/[0.12] to-white/[0.06]",
                    "border border-glass-subtle",
                    "shadow-glass-inset",
                    settings[option.key] ? "text-accent-blue" : "text-white/40"
                  )}
                >
                  {option.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{option.title}</h3>
                  <p className="text-xs text-white/40 mt-0.5">{option.description}</p>
                </div>
              </div>
              <Toggle
                checked={settings[option.key]}
                onChange={() => toggleSetting(option.key)}
                disabled={isUpdating}
              />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Info card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={cn(
          "relative mt-6 p-4 rounded-2xl overflow-hidden",
          "bg-gradient-to-br from-accent-blue/10 to-accent-blue/5",
          "border border-accent-blue/20",
          "shadow-[0_4px_24px_rgba(10,132,255,0.1),inset_0_1px_0_rgba(255,255,255,0.08)]"
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent-blue/30 to-transparent" />
        <div className="flex items-start gap-3 relative">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
              "bg-accent-blue/20 text-accent-blue"
            )}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm text-white/80">
              Уведомления приходят в Telegram бот{" "}
              <a
                href="https://t.me/avitofamclientsbot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-blue hover:underline"
              >
                @avitofamclientsbot
              </a>
            </p>
            <p className="text-xs text-white/40 mt-1">
              Убедитесь, что вы запустили бота и не заблокировали его
            </p>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
