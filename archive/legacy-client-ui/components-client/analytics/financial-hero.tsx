"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import type { AnalyticsResponse } from "@/hooks/use-analytics";

interface FinancialHeroProps {
  financial: AnalyticsResponse["financial"];
  hideTrend?: boolean;
  className?: string;
}

export function FinancialHero({ financial, hideTrend, className }: FinancialHeroProps) {
  const { totalProfit, profitTrend: rawTrend, totalRevenue, totalInvested, roi } = financial;
  const profitTrend = hideTrend ? 0 : rawTrend;

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
        <div className="text-center">
          <p className="text-sm text-white/40 mb-2">Прибыль за период</p>
          <motion.p
            className="text-4xl font-bold text-white"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {formatPrice(totalProfit)}
          </motion.p>

          {profitTrend !== 0 && (
            <motion.div
              className="flex items-center justify-center gap-1 mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium",
                  profitTrend > 0
                    ? "bg-accent-green/20 text-accent-green"
                    : "bg-accent-red/20 text-accent-red"
                )}
              >
                <svg
                  className={cn("w-3 h-3", profitTrend < 0 && "rotate-180")}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>
                {profitTrend > 0 ? "+" : ""}
                {profitTrend}% к прошлому периоду
              </div>
            </motion.div>
          )}

          {/* Sub-metrics row */}
          <motion.div
            className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-glass-subtle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="text-center">
              <p className="text-xs text-white/40">Вложено</p>
              <p className="text-sm font-semibold text-white">{formatPrice(totalInvested)}</p>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div className="text-center">
              <p className="text-xs text-white/40">Выручка</p>
              <p className="text-sm font-semibold text-white">{formatPrice(totalRevenue)}</p>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div className="text-center">
              <p className="text-xs text-white/40">ROI</p>
              <p
                className={cn(
                  "text-sm font-semibold",
                  roi > 0 ? "text-accent-green" : roi < 0 ? "text-accent-red" : "text-white/60"
                )}
              >
                {roi}%
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export function FinancialHeroSkeleton() {
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
        <div className="text-center">
          <div className="h-3 w-28 bg-white/10 rounded mx-auto mb-2" />
          <div className="h-10 w-40 bg-white/10 rounded mx-auto" />
          <div className="h-5 w-36 bg-white/10 rounded-full mx-auto mt-2" />
          <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-glass-subtle">
            {[0, 1, 2].map((i) => (
              <div key={i} className="text-center flex flex-col items-center gap-1">
                <div className="h-2.5 w-12 bg-white/10 rounded" />
                <div className="h-4 w-16 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
