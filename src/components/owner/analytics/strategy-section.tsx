"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { AnimatedNumber } from "@/components/shared/analytics/animated-number";
import { ForecastCard } from "@/components/shared/analytics/forecast-card";
import type { OwnerAnalyticsResponse } from "@/hooks/use-owner-analytics";

interface StrategySectionProps {
  healthScore: OwnerAnalyticsResponse["healthScore"];
  operational: OwnerAnalyticsResponse["operational"];
  forecast: OwnerAnalyticsResponse["forecast"];
}

// ===== Health Score dimensions =====

const SUB_SCORES: Array<{
  key: "profitability" | "fulfillment" | "growth" | "clientHealth";
  label: string;
  color: string;
}> = [
  { key: "profitability", label: "Доходность", color: "var(--accent-green)" },
  { key: "fulfillment", label: "Скорость отправки", color: "var(--accent-blue)" },
  { key: "growth", label: "Рост выручки", color: "var(--accent-purple)" },
  { key: "clientHealth", label: "Клиенты", color: "var(--accent-orange)" },
];

const RECOMMENDATIONS: Record<string, string> = {
  profitability: "Маржа ниже целевой — проверьте себестоимость товаров.",
  fulfillment: "Отправка медленная — проверьте загрузку шипперов.",
  growth: "Выручка не растёт — проверьте ассортимент и клиентскую активность.",
  clientHealth: "Мало повторных покупок — свяжитесь с клиентами или предложите промо.",
};

function getScoreColor(score: number): string {
  if (score >= 75) return "var(--accent-green)";
  if (score >= 50) return "var(--accent-blue)";
  if (score >= 25) return "var(--accent-orange)";
  return "var(--accent-red)";
}

// ===== Health Card =====

function HealthCard({ healthScore }: { healthScore: OwnerAnalyticsResponse["healthScore"] }) {
  const scoreColor = getScoreColor(healthScore.total);
  const r = 32;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference * (1 - healthScore.total / 100);

  // Find weakest dimension for recommendation
  const weakest = SUB_SCORES.reduce((min, sub) => {
    const val = healthScore[sub.key];
    const minVal = healthScore[min.key];
    return val < minVal ? sub : min;
  }, SUB_SCORES[0]);
  const showRecommendation = healthScore[weakest.key] < 70;

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Здоровье бизнеса</h3>

        <div className="flex gap-5 items-start">
          {/* Compact gauge */}
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="-4 -4 76 76" className="w-full h-full -rotate-90 overflow-visible">
              <defs>
                <filter id="health-glow">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <circle
                cx="34"
                cy="34"
                r={r}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="5"
              />
              <motion.circle
                cx="34"
                cy="34"
                r={r}
                fill="none"
                stroke={scoreColor}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                filter="url(#health-glow)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <AnimatedNumber value={healthScore.total} className="text-xl font-bold text-white" />
              <span className="text-[9px] text-white/40">/100</span>
              {healthScore.trend !== 0 && (
                <span
                  className={cn(
                    "text-[9px] font-medium",
                    healthScore.trend > 0 ? "text-accent-green" : "text-accent-red"
                  )}
                >
                  {healthScore.trend > 0 ? "+" : ""}
                  {healthScore.trend}
                </span>
              )}
            </div>
          </div>

          {/* Sub-scores */}
          <div className="flex-1 space-y-2 min-w-0">
            {SUB_SCORES.map((sub, i) => {
              const value = healthScore[sub.key];
              return (
                <div key={sub.key}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-2xs text-white/40">{sub.label}</span>
                    <span className="text-2xs font-medium text-white/60">{value}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${value}%` }}
                      transition={{ duration: 0.6, ease: "easeOut", delay: 0.4 + i * 0.08 }}
                      style={{ backgroundColor: sub.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recommendation */}
        {showRecommendation && (
          <div className="mt-3 pt-3 border-t border-glass-subtle">
            <p className="text-xs text-white/50">
              <span className="text-white/70 font-medium">Слабое место: {weakest.label}.</span>{" "}
              {RECOMMENDATIONS[weakest.key]}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Main strategy section =====

export function StrategySection({ healthScore, operational, forecast }: StrategySectionProps) {
  return (
    <div className="space-y-4">
      <HealthCard healthScore={healthScore} />
      <ForecastCard forecast={forecast} backlog={operational.pendingBacklog} />
    </div>
  );
}

export function StrategySectionSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1].map((i) => (
        <div
          key={i}
          className={cn(
            "relative rounded-2xl overflow-hidden animate-pulse",
            "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
            "border border-glass shadow-card"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="p-5">
            <div className="h-4 w-32 bg-white/10 rounded mb-4" />
            <div className="flex gap-5">
              <div className="w-20 h-20 rounded-full bg-white/[0.06]" />
              <div className="flex-1 space-y-3">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j}>
                    <div className="h-2 w-16 bg-white/10 rounded mb-1" />
                    <div className="h-1.5 bg-white/[0.06] rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
