"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";

interface HealthScoreProps {
  total: number;
  trend: number;
  profitability: number;
  selectionAccuracy: number;
  activity: number;
  growth: number;
  interpretation: string;
  className?: string;
}

const SUB_SCORES = [
  {
    key: "profitability" as const,
    label: "Доходность",
    color: "var(--accent-green)",
    tooltip:
      "Отдача от вложений (ROI). Чем больше зарабатываете на каждый вложенный рубль, тем выше балл",
  },
  {
    key: "selectionAccuracy" as const,
    label: "Точность выбора",
    color: "var(--accent-blue)",
    tooltip: "Как часто товары доходят до покупателя. Возвраты и отмены снижают балл",
  },
  {
    key: "activity" as const,
    label: "Активность",
    color: "var(--accent-orange)",
    tooltip: "Объём заказов по сравнению с прошлым периодом. Стабильный поток = высокий балл",
  },
  {
    key: "growth" as const,
    label: "Рост прибыли",
    color: "var(--accent-purple)",
    tooltip: "Как растёт ваша прибыль по сравнению с аналогичным прошлым периодом",
  },
];

function getScoreColor(score: number): string {
  if (score >= 75) return "var(--accent-green)";
  if (score >= 50) return "var(--accent-blue)";
  if (score >= 25) return "var(--accent-orange)";
  return "var(--accent-red)";
}

export function HealthScore({
  total,
  trend,
  profitability,
  selectionAccuracy,
  activity,
  growth,
  interpretation,
  className,
}: HealthScoreProps) {
  const scoreColor = getScoreColor(total);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference * (1 - total / 100);
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close tooltip on outside click
  useEffect(() => {
    if (!openTooltip) return;
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setOpenTooltip(null);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openTooltip]);

  const scores = { profitability, selectionAccuracy, activity, growth };

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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">Оценка бизнеса</h3>
          {trend !== 0 && (
            <div
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                trend > 0
                  ? "bg-accent-green/20 text-accent-green"
                  : "bg-accent-red/20 text-accent-red"
              )}
            >
              <svg
                className={cn("w-3 h-3", trend < 0 && "rotate-180")}
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
              {trend > 0 ? "+" : ""}
              {trend}
            </div>
          )}
        </div>

        {/* Circle */}
        <div className="flex justify-center mb-4">
          <div className="relative w-40 h-40 -my-4">
            <svg viewBox="-10 -10 120 120" className="w-full h-full -rotate-90 overflow-visible">
              <defs>
                <filter id="score-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="8"
              />
              {/* Score arc */}
              <motion.circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={scoreColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                filter="url(#score-glow)"
              />
            </svg>
            {/* Score number */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                className="text-3xl font-bold text-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {total}
              </motion.span>
              <span className="text-xs text-white/40">из 100</span>
            </div>
          </div>
        </div>

        {/* Interpretation */}
        <p className="text-sm text-white/60 text-center mb-6">{interpretation}</p>

        {/* Sub-scores */}
        <div className="space-y-3" ref={tooltipRef}>
          {SUB_SCORES.map((sub, i) => {
            const value = scores[sub.key];
            const isOpen = openTooltip === sub.key;
            return (
              <div key={sub.key} className="relative">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-white/60">{sub.label}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenTooltip(isOpen ? null : sub.key);
                      }}
                      aria-label="Подробнее"
                      className={cn(
                        "relative w-4 h-4 rounded-full flex items-center justify-center",
                        "after:absolute after:inset-[-14px] after:content-['']",
                        "text-2xs font-semibold leading-none transition-all",
                        "backdrop-blur-sm border",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-full",
                        isOpen
                          ? [
                              "bg-gradient-to-b from-white/[0.20] to-white/[0.10]",
                              "border-glass-active text-white/80",
                              "shadow-card",
                            ]
                          : [
                              "bg-gradient-to-b from-white/[0.10] to-white/[0.05]",
                              "border-glass-subtle text-white/40",
                              "shadow-glass-inset",
                              "hover:from-white/[0.15] hover:to-white/[0.08] hover:border-white/20 hover:text-white/60",
                            ]
                      )}
                    >
                      i
                    </button>
                  </div>
                  <span className="text-xs font-medium text-white/80">{value}</span>
                </div>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <p className="text-xs text-white/40 leading-relaxed mb-1.5 pl-0.5">
                        {sub.tooltip}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div
                  className={cn(
                    "h-2 rounded-full overflow-hidden border border-glass-minimal",
                    "bg-white/[0.15]"
                  )}
                >
                  <motion.div
                    className="h-full rounded-r-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{
                      duration: 0.8,
                      ease: "easeOut",
                      delay: 0.4 + i * 0.1,
                    }}
                    style={{
                      backgroundColor: sub.color,
                      borderRight: `2px solid color-mix(in srgb, ${sub.color} 33%, transparent)`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HealthScoreSkeleton() {
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
        <div className="flex justify-between mb-6">
          <div className="h-6 w-28 bg-white/10 rounded" />
          <div className="h-5 w-12 bg-white/10 rounded-full" />
        </div>
        <div className="flex justify-center mb-4">
          <div className="w-32 h-32 rounded-full bg-white/[0.06] border-4 border-glass-minimal" />
        </div>
        <div className="h-4 w-48 bg-white/10 rounded mx-auto mb-6" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="flex justify-between mb-1">
                <div className="h-3 w-20 bg-white/10 rounded" />
                <div className="h-3 w-6 bg-white/10 rounded" />
              </div>
              <div className="h-1.5 bg-white/[0.08] rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
