"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

interface StatItem {
  label: string;
  value: string | number;
  subValue?: string;
  color?: "default" | "green" | "purple" | "orange" | "red";
}

interface StatsGridProps {
  stats: StatItem[];
  columns?: 2 | 3 | 4;
}

const colorClasses = {
  default: "text-white",
  green: "text-accent-green",
  purple: "text-accent-purple",
  orange: "text-accent-orange",
  red: "text-accent-red",
};

export function StatsGrid({ stats, columns = 4 }: StatsGridProps) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4"
      )}
    >
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card"
        >
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <p className={cn("text-2xl font-bold", colorClasses[stat.color || "default"])}>
            {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
          </p>
          <p className="text-sm text-white/60">{stat.label}</p>
          {stat.subValue && <p className="text-xs text-white/40 mt-1">{stat.subValue}</p>}
        </motion.div>
      ))}
    </div>
  );
}

export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-4 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card animate-pulse"
        >
          <div className="h-8 w-24 bg-white/10 rounded mb-2" />
          <div className="h-4 w-16 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  );
}
