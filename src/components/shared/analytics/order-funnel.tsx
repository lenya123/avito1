"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { ProgressRing } from "./progress-ring";
import type { OwnerAnalyticsResponse } from "@/hooks/use-owner-analytics";

interface OrderFunnelProps {
  funnel: OwnerAnalyticsResponse["funnel"];
}

const MAIN_STAGES: Array<{
  key: keyof OwnerAnalyticsResponse["funnel"];
  label: string;
  color: string;
}> = [
  { key: "awaitingShipment", label: "Ожидают отправки", color: "var(--accent-orange)" },
  { key: "collecting", label: "Собираются", color: "var(--accent-teal)" },
  { key: "inTransit", label: "В пути", color: "var(--accent-blue)" },
  { key: "completed", label: "Приняты", color: "var(--accent-green)" },
];

export function OrderFunnel({ funnel }: OrderFunnelProps) {
  const totalOrders =
    funnel.awaitingShipment +
    funnel.collecting +
    funnel.inTransit +
    funnel.completed +
    funnel.returned +
    funnel.problem +
    funnel.cancelled;
  const maxValue = Math.max(totalOrders, 1);

  const returnRate = totalOrders > 0 ? Math.round((funnel.returned / totalOrders) * 100) : 0;
  const problemRate = totalOrders > 0 ? Math.round((funnel.problem / totalOrders) * 100) : 0;
  const cancelRate = totalOrders > 0 ? Math.round((funnel.cancelled / totalOrders) * 100) : 0;

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative p-6">
        <h3 className="text-lg font-semibold text-white mb-5">Воронка заказов</h3>

        {/* Total orders */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-glass-subtle">
          <span className="text-sm text-white/60">Всего заказов</span>
          <span className="text-2xl font-bold text-white">{totalOrders}</span>
        </div>

        {/* Main funnel stages */}
        <div className="space-y-4">
          {MAIN_STAGES.map((stage, i) => {
            const value = funnel[stage.key];
            const percentage = Math.round((value / maxValue) * 100);

            return (
              <div key={stage.key}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="text-sm text-white/60">{stage.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-white">{value}</span>
                </div>

                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: stage.color,
                      opacity: 0.7,
                      boxShadow: `0 0 8px ${stage.color}33`,
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.1 }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary rings: Возвраты, Проблемы, Отменено */}
        <div className="grid grid-cols-3 gap-2 mt-5 pt-5 border-t border-glass-subtle">
          {[
            {
              label: "Возвраты",
              value: returnRate,
              count: funnel.returned,
              color: "var(--accent-orange)",
            },
            {
              label: "Проблемы",
              value: problemRate,
              count: funnel.problem,
              color: "var(--accent-red)",
            },
            {
              label: "Отменено",
              value: cancelRate,
              count: funnel.cancelled,
              color: "var(--accent-red)",
            },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-1">
              <ProgressRing
                value={item.value}
                size={32}
                color={item.color}
                showLabel
                labelOverride={item.count}
              />
              <p className="text-2xs text-white/40">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OrderFunnelSkeleton() {
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
        <div className="h-6 w-40 bg-white/10 rounded mb-5" />
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="flex justify-between mb-1">
                <div className="h-3.5 w-28 bg-white/10 rounded" />
                <div className="h-3.5 w-8 bg-white/10 rounded" />
              </div>
              <div className="h-2 bg-white/[0.06] rounded-full" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-5 pt-5 border-t border-glass-subtle">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-8 h-8 rounded-full bg-white/10" />
              <div className="h-2.5 w-14 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
