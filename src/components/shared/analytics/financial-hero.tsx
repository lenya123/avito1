"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import { AnimatedNumber } from "./animated-number";

type MetricKey = "cost" | "revenue" | "roiPercent" | "aov";

interface OwnerFinancialHeroProps {
  profit: number;
  profitChange: number | null;
  revenue: number;
  cost: number;
  roiPercent: number;
  aov: number;
  clientDepositPool?: number;
  revenueChange?: number | null;
  costChange?: number | null;
  aovChange?: number | null;
  roiChange?: number | null;
  chartData?: Array<{
    revenue: number;
    profit: number;
    orders: number;
    aov: number;
    roiPercent: number;
  }>;
}

const SUPPORTING_METRICS: Array<{
  key: MetricKey;
  label: string;
  format: (v: number) => string;
  dotColor: string;
  changeKey: "costChange" | "revenueChange" | "aovChange" | "roiChange" | null;
}> = [
  {
    key: "cost",
    label: "Вложено",
    format: (v) => formatPrice(v),
    dotColor: "bg-white/30",
    changeKey: "costChange",
  },
  {
    key: "revenue",
    label: "Выручка",
    format: (v) => formatPrice(v),
    dotColor: "bg-[#30D158]",
    changeKey: "revenueChange",
  },
  {
    key: "roiPercent",
    label: "ROI",
    format: (v) => `${v}%`,
    dotColor: "bg-[#64D2FF]",
    changeKey: "roiChange",
  },
  {
    key: "aov",
    label: "Ср. чек",
    format: (v) => formatPrice(v),
    dotColor: "bg-[#FF9F0A]",
    changeKey: "aovChange",
  },
];

function ChangeBadge({ change, large }: { change: number | null | undefined; large?: boolean }) {
  if (change === null || change === undefined || change === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium",
        large ? "text-sm" : "text-2xs",
        change > 0 ? "text-accent-green" : "text-accent-red"
      )}
    >
      <svg
        className={cn(large ? "w-3.5 h-3.5" : "w-2.5 h-2.5", change < 0 && "rotate-180")}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M5 10l7-7m0 0l7 7m-7-7v18"
        />
      </svg>
      {change > 0 ? "+" : ""}
      {change}%
    </span>
  );
}

export function FinancialHero({
  profit,
  profitChange,
  revenue,
  cost,
  roiPercent,
  aov,
  clientDepositPool,
  revenueChange,
  costChange,
  aovChange,
  roiChange,
}: OwnerFinancialHeroProps) {
  const values: Record<MetricKey, number> = { cost, revenue, roiPercent, aov };
  const changes: Record<string, number | null | undefined> = {
    costChange,
    revenueChange,
    aovChange,
    roiChange,
  };

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

      <div className="relative p-4 sm:p-6">
        {/* Profit Spotlight */}
        <div className="relative">
          {/* Subtle purple glow behind number */}
          <div className="absolute -inset-x-8 -inset-y-4 bg-[#BF5AF2]/[0.04] blur-2xl rounded-full pointer-events-none" />

          <motion.div
            className="relative"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <p className="text-2xs text-white/40 mb-1">Прибыль</p>
            <div className="flex items-baseline gap-3">
              <AnimatedNumber
                value={profit}
                format={formatPrice}
                className="text-4xl sm:text-5xl font-bold text-white tracking-tight"
              />
              {profitChange !== null && profitChange !== 0 && (
                <ChangeBadge change={profitChange} large />
              )}
            </div>
          </motion.div>
        </div>

        {/* Supporting metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-glass-subtle">
          {SUPPORTING_METRICS.map((metric, i) => (
            <motion.div
              key={metric.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.35 }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={cn("w-2 h-2 rounded-full", metric.dotColor)} />
                <span className="text-2xs text-white/40">{metric.label}</span>
              </div>
              <AnimatedNumber
                value={values[metric.key]}
                format={metric.format}
                className="text-xl font-semibold text-white block"
              />
              {metric.changeKey && (
                <div className="mt-0.5">
                  <ChangeBadge change={changes[metric.changeKey]} />
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Client deposits */}
        {clientDepositPool !== undefined && clientDepositPool > 0 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-glass-subtle">
            <span className="text-2xs text-white/40">Депозиты клиентов</span>
            <span className="text-sm font-medium text-white">{formatPrice(clientDepositPool)}</span>
          </div>
        )}
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
      <div className="p-4 sm:p-6">
        {/* Profit skeleton */}
        <div className="mb-5">
          <div className="h-2.5 w-14 bg-white/10 rounded mb-2" />
          <div className="h-10 w-44 bg-white/10 rounded" />
        </div>
        {/* Supporting metrics skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-glass-subtle">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-2 w-12 bg-white/10 rounded mb-2" />
              <div className="h-6 w-20 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
