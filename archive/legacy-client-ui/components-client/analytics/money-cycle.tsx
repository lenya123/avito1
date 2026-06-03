"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import type { AnalyticsResponse } from "@/hooks/use-analytics";

interface MoneyCycleProps {
  moneyCycle: AnalyticsResponse["moneyCycle"];
  delivery?: AnalyticsResponse["delivery"];
  className?: string;
}

function getSuccessColor(percent: number): string {
  if (percent >= 90) return "text-accent-green";
  if (percent >= 75) return "text-accent-orange";
  return "text-accent-red";
}

const SERVICE_INFO: Record<string, { emoji: string; name: string }> = {
  cdek: { emoji: "📦", name: "СДЭК" },
  avito: { emoji: "🏪", name: "Avito" },
  yandex: { emoji: "🚀", name: "Яндекс" },
  pochta: { emoji: "📮", name: "Почта РФ" },
  "5post": { emoji: "📬", name: "5Post" },
};

function getDaysWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "дней";
  if (lastDigit === 1) return "день";
  if (lastDigit >= 2 && lastDigit <= 4) return "дня";
  return "дней";
}

function getSpeedColor(days: number): string {
  if (days <= 10) return "text-accent-green";
  if (days <= 20) return "text-accent-orange";
  return "text-accent-red";
}

export function MoneyCycle({ moneyCycle, delivery, className }: MoneyCycleProps) {
  const { avgCycleDays, byService } = moneyCycle;

  if (avgCycleDays === 0 && byService.length === 0) return null;

  const daysRound = Math.round(avgCycleDays);
  const totalOrders = byService.reduce((sum, s) => sum + s.ordersCount, 0);

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card",
        className
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative p-6">
        <h3 className="text-lg font-semibold text-white mb-1">Доставка</h3>
        <p className="text-xs text-white/40 mb-5">Среднее время от заказа до завершения</p>

        {/* Main number */}
        <motion.div
          className="text-center mb-5"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <span className={cn("text-3xl font-bold", getSpeedColor(daysRound))}>{daysRound}</span>
          <span className="text-sm text-white/40 ml-1.5">{getDaysWord(daysRound)}</span>
        </motion.div>

        {/* By service */}
        {byService.length > 0 && (
          <div className="space-y-2">
            {byService.map((s, i) => {
              const info = SERVICE_INFO[s.service] || { emoji: "📦", name: s.service };
              const days = Math.round(s.avgDays);
              const share = totalOrders > 0 ? Math.round((s.ordersCount / totalOrders) * 100) : 0;
              const deliveryMatch = delivery?.find((d) => d.service === s.service);
              const successPercent = deliveryMatch
                ? Math.round(100 - (deliveryMatch.returnPercent || 0))
                : null;

              return (
                <motion.div
                  key={s.service}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl",
                    "bg-gradient-to-b from-white/[0.04] to-transparent",
                    "border border-glass-subtle"
                  )}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  {/* Emoji */}
                  <div
                    className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                      "bg-gradient-to-br from-white/[0.08] to-white/[0.04]",
                      "border border-glass-subtle"
                    )}
                  >
                    <span className="text-lg">{info.emoji}</span>
                  </div>

                  {/* Name + count */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{info.name}</p>
                    <p className="text-xs text-white/40">{s.ordersCount} заказов</p>
                  </div>

                  {/* Days */}
                  <div className="text-right">
                    <p className={cn("text-sm font-medium", getSpeedColor(days))}>{days} дн.</p>
                    <p className="text-2xs text-white/20">ср. время</p>
                  </div>

                  {/* Share */}
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">{share}%</p>
                    <p className="text-2xs text-white/20">доля</p>
                  </div>

                  {/* Success rate */}
                  {successPercent !== null && (
                    <div className="text-right">
                      <p className={cn("text-sm font-medium", getSuccessColor(successPercent))}>
                        {successPercent}%
                      </p>
                      <p className="text-2xs text-white/20">успешно</p>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function MoneyCycleSkeleton() {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass",
        "shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6">
        <div className="h-6 w-24 bg-white/10 rounded mb-1" />
        <div className="h-3 w-48 bg-white/10 rounded mb-5" />
        <div className="h-10 w-20 bg-white/10 rounded mx-auto mb-5" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-glass-subtle"
            >
              <div className="w-9 h-9 bg-white/10 rounded-lg shrink-0" />
              <div className="flex-1">
                <div className="h-4 w-20 bg-white/10 rounded mb-1" />
                <div className="h-3 w-14 bg-white/10 rounded" />
              </div>
              <div className="h-4 w-12 bg-white/10 rounded" />
              <div className="h-4 w-10 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
