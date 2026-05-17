"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import type { AnalyticsResponse } from "@/hooks/use-analytics";

interface StatusDonutProps {
  funnel: AnalyticsResponse["funnel"];
  className?: string;
}

type StatusSegment = {
  label: string;
  count: number;
  color: string;
};

function buildSegments(funnel: AnalyticsResponse["funnel"]): StatusSegment[] {
  const completed = funnel.delivered - funnel.returned;
  const inTransit = funnel.shipped - funnel.delivered;
  const waiting = funnel.paid - funnel.shipped;
  const returns = funnel.returned;
  const cancels = funnel.cancelled;

  return [
    { label: "Завершено", count: Math.max(0, completed), color: "var(--accent-green)" },
    { label: "В пути", count: Math.max(0, inTransit), color: "var(--accent-blue)" },
    { label: "Ожидают", count: Math.max(0, waiting), color: "var(--accent-teal)" },
    { label: "Возвраты", count: Math.max(0, returns), color: "var(--accent-orange)" },
    { label: "Отмены", count: Math.max(0, cancels), color: "var(--accent-red)" },
  ].filter((s) => s.count > 0);
}

export function StatusDonut({ funnel, className }: StatusDonutProps) {
  const segments = buildSegments(funnel);
  const total = segments.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) return null;

  // SVG donut
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  const arcs = segments.map((seg) => {
    const fraction = seg.count / total;
    const dash = fraction * circumference;
    const gap = circumference - dash;
    const offset = -accumulated * circumference;
    accumulated += fraction;
    return { ...seg, dash, gap, offset, fraction };
  });

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
        <h3 className="text-lg font-semibold text-white mb-5">Статусы заказов</h3>

        <div className="flex items-center gap-6">
          {/* Donut */}
          <div className="relative w-28 h-28 shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="10"
              />
              {arcs.map((arc, i) => (
                <motion.circle
                  key={arc.label}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth="10"
                  strokeLinecap="butt"
                  strokeDasharray={`${arc.dash} ${arc.gap}`}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: arc.offset }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: i * 0.05 }}
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-white">{total}</span>
              <span className="text-2xs text-white/40">всего</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-2">
            {arcs.map((arc) => {
              const pct = Math.round(arc.fraction * 100);
              return (
                <div key={arc.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: arc.color }}
                    />
                    <span className="text-xs text-white/60">{arc.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white">{arc.count}</span>
                    <span className="text-xs text-white/20 w-8 text-right">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatusDonutSkeleton() {
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
        <div className="flex items-center gap-6">
          <div className="w-28 h-28 rounded-full bg-white/[0.06] border-4 border-glass-minimal shrink-0" />
          <div className="flex-1 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-white/10 rounded-full" />
                  <div className="h-3 w-16 bg-white/10 rounded" />
                </div>
                <div className="h-3 w-10 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
