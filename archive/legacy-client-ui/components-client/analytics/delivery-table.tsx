"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import type { AnalyticsResponse } from "@/hooks/use-analytics";

interface DeliveryTableProps {
  delivery: AnalyticsResponse["delivery"];
  className?: string;
}

const DELIVERY_INFO: Record<string, { emoji: string; name: string }> = {
  cdek: { emoji: "📦", name: "СДЭК" },
  avito: { emoji: "🏪", name: "Avito" },
  yandex: { emoji: "🚀", name: "Яндекс" },
  pochta: { emoji: "📮", name: "Почта РФ" },
  "5post": { emoji: "📬", name: "5Post" },
};

function getSpeedColor(days: number): string {
  if (days <= 5) return "text-accent-green";
  if (days <= 10) return "text-accent-orange";
  return "text-accent-red";
}

export function DeliveryTable({ delivery, className }: DeliveryTableProps) {
  if (delivery.length === 0) return null;

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
        <h3 className="text-lg font-semibold text-white mb-5">Службы доставки</h3>

        <div className="space-y-2">
          {delivery.map((d, i) => {
            const info = DELIVERY_INFO[d.service] || {
              emoji: "📦",
              name: d.service,
            };

            return (
              <motion.div
                key={d.service}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl",
                  "bg-gradient-to-b from-white/[0.04] to-transparent",
                  "border border-glass-subtle"
                )}
              >
                {/* Icon */}
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
                  <p className="text-xs text-white/40">{d.ordersCount} заказов</p>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 shrink-0">
                  {/* Avg days */}
                  <div className="text-right">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        d.avgDeliveryDays > 0 ? getSpeedColor(d.avgDeliveryDays) : "text-white/40"
                      )}
                    >
                      {d.avgDeliveryDays > 0 ? `${d.avgDeliveryDays} дн.` : "—"}
                    </p>
                    <p className="text-2xs text-white/20">ср. время</p>
                  </div>

                  {/* Late + return */}
                  <div className="text-right">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        d.latePercent > 20
                          ? "text-accent-red"
                          : d.latePercent > 0
                            ? "text-accent-orange"
                            : "text-white/40"
                      )}
                    >
                      {d.latePercent > 0 ? `${d.latePercent}%` : "0%"}
                    </p>
                    <p className="text-2xs text-white/20">просрочки</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DeliveryTableSkeleton() {
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
        <div className="h-6 w-36 bg-white/10 rounded mb-5" />
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
