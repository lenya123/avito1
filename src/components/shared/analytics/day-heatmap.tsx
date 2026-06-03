"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

interface DayHeatmapProps {
  data: number[]; // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
}

// Reorder to Mon-Sun for Russian display
const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const REORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun indices into the Sun-first array

const BAR_MAX_H = 48;

export function DayHeatmap({ data }: DayHeatmapProps) {
  if (!data || data.length < 7) return null;

  const reordered = REORDER.map((i) => data[i]);
  const maxValue = Math.max(...reordered, 1);
  const bestIdx = reordered.indexOf(Math.max(...reordered));

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative px-6 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-white">Заказы по дням</h4>
          <span className="text-2xs text-white/30">Лучший: {DAY_LABELS[bestIdx]}</span>
        </div>

        {/* Bars */}
        <div className="flex items-end justify-between gap-2" style={{ height: BAR_MAX_H }}>
          {reordered.map((value, i) => {
            const isBest = i === bestIdx;
            const barH = Math.max(4, (value / maxValue) * BAR_MAX_H);

            return (
              <motion.div
                key={i}
                className={cn(
                  "flex-1 rounded-t-md",
                  isBest
                    ? "bg-gradient-to-t from-[#64D2FF]/50 to-[#64D2FF]/90"
                    : "bg-gradient-to-t from-[#64D2FF]/20 to-[#64D2FF]/50"
                )}
                style={isBest ? { boxShadow: "0 0 12px rgba(100,210,255,0.3)" } : undefined}
                initial={{ height: 0 }}
                animate={{ height: barH }}
                transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.04 }}
              />
            );
          })}
        </div>

        {/* Values */}
        <div className="flex justify-between gap-2 mt-1">
          {reordered.map((value, i) => (
            <span key={`v-${i}`} className="text-2xs text-white/40 text-center flex-1">
              {value}
            </span>
          ))}
        </div>

        {/* Day labels */}
        <div className="flex justify-between gap-2 mt-0.5">
          {DAY_LABELS.map((label, i) => (
            <span
              key={label}
              className={cn(
                "text-2xs text-center flex-1",
                i === bestIdx ? "text-[#64D2FF] font-medium" : "text-white/30"
              )}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
