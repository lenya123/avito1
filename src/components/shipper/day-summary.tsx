"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import type { OrderFilter } from "./order-filters";

interface DaySummaryProps {
  counts: Record<OrderFilter, number>;
  activeFilter: OrderFilter;
  onFilterChange: (filter: OrderFilter) => void;
}

const ITEMS: {
  key: OrderFilter;
  label: string;
  color: string;
  glowColor: string;
  icon?: boolean;
}[] = [
  {
    key: "collect",
    label: "Собрать",
    color: "text-accent-blue",
    glowColor: "rgba(10,132,255,0.3)",
  },
  {
    key: "ship",
    label: "Отправить",
    color: "text-accent-green",
    glowColor: "rgba(48,209,88,0.3)",
  },
  {
    key: "tracking",
    label: "В пути",
    color: "text-accent-teal",
    glowColor: "rgba(100,210,255,0.3)",
  },
  {
    key: "returns",
    label: "Возвраты",
    color: "text-accent-orange",
    glowColor: "rgba(255,159,10,0.3)",
  },
  {
    key: "history",
    label: "История",
    color: "text-white/50",
    glowColor: "rgba(255,255,255,0.15)",
    icon: true,
  },
];

export function DaySummary({ counts, activeFilter, onFilterChange }: DaySummaryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-5 gap-2"
    >
      {ITEMS.map((item) => {
        const isActive = activeFilter === item.key;
        const count = counts[item.key] || 0;

        return (
          <button
            key={item.key}
            onClick={() => onFilterChange(item.key)}
            className={cn(
              "relative rounded-xl px-2 py-3 text-center transition-all duration-200",
              "border backdrop-blur-xl",
              isActive
                ? [
                    "bg-gradient-to-b from-white/[0.12] to-white/[0.06]",
                    "border-white/25",
                    "shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)]",
                  ]
                : ["bg-white/[0.04] border-white/10", "hover:bg-white/[0.08] hover:border-white/15"]
            )}
          >
            {item.icon ? (
              <div className={cn("flex items-center justify-center h-8", item.color)}>
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            ) : (
              <div
                className={cn("text-2xl font-bold tabular-nums", item.color)}
                style={isActive ? { textShadow: `0 0 12px ${item.glowColor}` } : undefined}
              >
                {count}
              </div>
            )}
            <div className="text-xs text-white/50 mt-1 leading-tight">{item.label}</div>
          </button>
        );
      })}
    </motion.div>
  );
}
