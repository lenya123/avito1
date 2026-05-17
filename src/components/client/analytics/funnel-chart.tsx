"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import type { AnalyticsResponse } from "@/hooks/use-analytics";

interface FunnelChartProps {
  funnel: AnalyticsResponse["funnel"];
  className?: string;
}

const FUNNEL_STAGES: {
  key: keyof AnalyticsResponse["funnel"];
  label: string;
  color: string;
}[] = [
  { key: "created", label: "Создано", color: "var(--accent-blue)" },
  { key: "paid", label: "Оплачено", color: "var(--accent-teal)" },
  { key: "shipped", label: "Отправлено", color: "var(--accent-teal)" },
  { key: "delivered", label: "Доставлено", color: "var(--accent-green)" },
  { key: "returned", label: "Возвраты", color: "var(--accent-orange)" },
  { key: "cancelled", label: "Отмены", color: "var(--accent-red)" },
];

export function FunnelChart({ funnel, className }: FunnelChartProps) {
  const maxValue = Math.max(funnel.created, 1);

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
        <h3 className="text-lg font-semibold text-white mb-5">Воронка заказов</h3>

        <div className="space-y-3">
          {FUNNEL_STAGES.map((stage, i) => {
            const value = funnel[stage.key];
            const percent = funnel.created > 0 ? Math.round((value / funnel.created) * 100) : 0;
            const barWidth = maxValue > 0 ? (value / maxValue) * 100 : 0;

            return (
              <div key={stage.key} className="flex items-center gap-3">
                <span className="text-xs text-white/40 w-24 shrink-0 text-right">
                  {stage.label}
                </span>
                <div className="flex-1 h-6 rounded-md bg-white/[0.04] overflow-hidden relative">
                  <motion.div
                    className="h-full rounded-md"
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{
                      duration: 0.6,
                      ease: "easeOut",
                      delay: 0.1 * i,
                    }}
                    style={{
                      backgroundColor: stage.color,
                      opacity: 0.7,
                    }}
                  />
                  {value > 0 && (
                    <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-white">
                      {value}
                    </span>
                  )}
                </div>
                <span className="text-xs text-white/40 w-10 shrink-0">{percent}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function FunnelChartSkeleton() {
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
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-24 bg-white/10 rounded shrink-0" />
              <div
                className="flex-1 h-6 bg-white/[0.06] rounded-md"
                style={{ maxWidth: `${100 - i * 12}%` }}
              />
              <div className="h-3 w-10 bg-white/10 rounded shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
