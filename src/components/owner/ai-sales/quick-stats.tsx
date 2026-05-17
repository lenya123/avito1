"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import type { StatsResponse } from "@/hooks/use-ai-sales";

interface QuickStatsProps {
  stats: StatsResponse | undefined;
  isLoading: boolean;
}

interface StatItem {
  label: string;
  value: string | number;
  color: string;
  glow?: string;
}

export function QuickStats({ stats, isLoading }: QuickStatsProps) {
  const items: StatItem[] = [
    {
      label: "Ожидают",
      value: stats?.pendingCount ?? 0,
      color: "text-accent-orange",
      glow: "shadow-yellow-500/20",
    },
    {
      label: "Одобрено",
      value: stats?.totals?.totalApproved ?? 0,
      color: "text-accent-green",
      glow: "shadow-green-500/20",
    },
    {
      label: "Accuracy",
      value: stats?.totals?.avgApprovalRate ? `${stats.totals.avgApprovalRate}%` : "—",
      color: "text-accent-purple",
      glow: "shadow-accent-purple/20",
    },
    {
      label: "Стоимость",
      value: stats?.totals?.estimatedCostUsd ? `$${stats.totals.estimatedCostUsd}` : "$0",
      color: "text-accent-blue",
      glow: "shadow-blue-500/20",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[72px] rounded-2xl bg-white/[0.04] border border-glass-subtle animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className={cn(
            "relative p-3 rounded-2xl overflow-hidden",
            "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
            "border border-glass",
            "shadow-card"
          )}
        >
          <p className="text-xs text-white/40 mb-1">{item.label}</p>
          <p className={cn("text-lg font-semibold", item.color)}>{item.value}</p>
        </motion.div>
      ))}
    </div>
  );
}
