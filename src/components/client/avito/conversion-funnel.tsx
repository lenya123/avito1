"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

interface ConversionFunnelProps {
  views: number;
  favorites: number;
  contacts: number;
}

const stages = [
  {
    key: "views",
    label: "Просмотры",
    color: "bg-accent-blue",
    textColor: "text-accent-blue",
    colorVar: "var(--accent-blue)",
  },
  {
    key: "favorites",
    label: "Избранное",
    color: "bg-accent-orange",
    textColor: "text-accent-orange",
    colorVar: "var(--accent-orange)",
  },
  {
    key: "contacts",
    label: "Контакты",
    color: "bg-accent-green",
    textColor: "text-accent-green",
    colorVar: "var(--accent-green)",
  },
] as const;

export function ConversionFunnel({ views, favorites, contacts }: ConversionFunnelProps) {
  if (views === 0) {
    return (
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden p-6 text-center",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "backdrop-blur-xl border border-glass shadow-card"
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <p className="text-white/40 text-sm">Нет данных для воронки</p>
      </div>
    );
  }

  const values = { views, favorites, contacts };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative rounded-2xl overflow-hidden p-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <h3 className="text-sm font-semibold text-white mb-3">Воронка конверсии</h3>
      <div className="space-y-3">
        {stages.map((stage, i) => {
          const value = values[stage.key];
          const pct = views > 0 ? (value / views) * 100 : 0;
          const width = Math.max(pct, 3); // min width for visibility

          return (
            <div key={stage.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60">{stage.label}</span>
                <div className="flex items-center gap-2">
                  <span className={stage.textColor}>{pct.toFixed(1)}%</span>
                  <span className="text-white/40">{value.toLocaleString("ru")}</span>
                </div>
              </div>
              <div
                className={cn(
                  "h-2 rounded-full overflow-hidden",
                  "bg-white/[0.15]",
                  "border border-glass-minimal"
                )}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 + i * 0.1 }}
                  className={cn("h-full rounded-r-full", stage.color)}
                  style={{
                    borderRight: `2px solid color-mix(in srgb, ${stage.colorVar} 33%, transparent)`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversion rates */}
      <div className="flex items-center gap-3 flex-wrap mt-3 pt-3 border-t border-glass-minimal">
        <div className="text-xs">
          <span className="text-white/40">Просм. → Избр.: </span>
          <span className="text-accent-orange font-medium">
            {views > 0 ? ((favorites / views) * 100).toFixed(1) : "0"}%
          </span>
        </div>
        <div className="text-xs">
          <span className="text-white/40">Просм. → Конт.: </span>
          <span className="text-accent-green font-medium">
            {views > 0 ? ((contacts / views) * 100).toFixed(1) : "0"}%
          </span>
        </div>
      </div>
    </motion.div>
  );
}
