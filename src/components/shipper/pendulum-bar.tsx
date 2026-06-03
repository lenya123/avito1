"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";

// ─── Types ──────────────────────────────────────────────────────────

export interface EfficiencyData {
  /** Efficiency percentage 0-100 */
  value: number;
  /** Days with shipments this month */
  daysActive: number;
  /** Total work days passed this month */
  workDaysPassed: number;
  /** Current rate based on efficiency */
  currentRate: number;
  /** Rate boundaries */
  rateMin: number;
  rateMax: number;
  /** Penalty rate for missed work days */
  penaltyRate: number;
}

/** @deprecated Use EfficiencyData */
export type PendulumData = EfficiencyData;

interface EfficiencyBarProps {
  data: EfficiencyData;
}

// ─── Helpers ────────────────────────────────────────────────────────

function efficiencyColor(value: number) {
  if (value >= 85) {
    return {
      text: "text-accent-green",
      glow: "rgba(48,209,88,0.4)",
      glowSolid: "#30D158",
      badge: "bg-accent-green/15 text-accent-green border-accent-green/20",
      label: "Отлично",
    };
  }
  if (value >= 60) {
    return {
      text: "text-accent-orange",
      glow: "rgba(255,159,10,0.4)",
      glowSolid: "#FF9F0A",
      badge: "bg-accent-orange/15 text-accent-orange border-accent-orange/20",
      label: "Нужно подтянуться",
    };
  }
  return {
    text: "text-accent-red",
    glow: "rgba(255,69,58,0.4)",
    glowSolid: "#FF453A",
    badge: "bg-accent-red/15 text-accent-red border-accent-red/20",
    label: "Критично",
  };
}

// ─── Track ──────────────────────────────────────────────────────────

function EfficiencyTrack({
  value,
  rateMin,
  rateMax,
}: {
  value: number;
  rateMin: number;
  rateMax: number;
}) {
  const colors = efficiencyColor(value);
  const fillPercent = Math.min(Math.max(value, 0), 100);

  return (
    <div className="relative py-1">
      {/* Glow */}
      {fillPercent > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ duration: 1.2 }}
          className="absolute inset-0 rounded-2xl"
          style={{
            background: `radial-gradient(ellipse at ${fillPercent / 2}% 50%, ${colors.glow}, transparent 60%)`,
            filter: "blur(8px)",
          }}
        />
      )}

      {/* Track */}
      <div
        className="relative h-5 rounded-2xl overflow-hidden border border-white/[0.08]"
        style={{
          background: "linear-gradient(to bottom, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3), inset 0 -1px 0 rgba(255,255,255,0.03)",
        }}
      >
        {/* Fill */}
        {fillPercent > 0 && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${fillPercent}%` }}
            transition={{ duration: 0.9, ease: [0.25, 1, 0.5, 1] }}
            className="absolute inset-y-0 left-0"
            style={{
              background: `linear-gradient(to right, ${colors.glowSolid}10, ${colors.glowSolid}80)`,
            }}
          />
        )}
      </div>

      {/* Labels under track */}
      <div className="flex justify-between mt-1">
        <span className="text-2xs text-white/30">{formatPrice(rateMin)}</span>
        <span className="text-2xs text-white/30">{formatPrice(rateMax)}</span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function PendulumBar({ data }: EfficiencyBarProps) {
  const { value, daysActive, workDaysPassed, currentRate } = data;
  const colors = efficiencyColor(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className={cn(
        "rounded-2xl p-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass",
        "shadow-card"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <motion.span
            key={value}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn("text-2xl font-bold", colors.text)}
            style={{ textShadow: `0 0 16px ${colors.glow}` }}
          >
            {value}%
          </motion.span>
          <span className={cn("text-xs font-medium", colors.text, "opacity-60")}>
            {colors.label}
          </span>
        </div>
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", colors.badge)}>
          {formatPrice(currentRate)} / заказ
        </span>
      </div>

      {/* Track */}
      <EfficiencyTrack value={value} rateMin={data.rateMin} rateMax={data.rateMax} />

      {/* Stats */}
      <div className="flex items-center gap-2 mt-2">
        <div
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-xl border",
            daysActive === workDaysPassed
              ? "bg-accent-green/10 border-accent-green/20"
              : "bg-accent-orange/10 border-accent-orange/20"
          )}
        >
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              daysActive === workDaysPassed ? "bg-accent-green" : "bg-accent-orange"
            )}
          />
          <span className="text-2xs text-white/60">
            Отработано {daysActive} / {workDaysPassed} дней
          </span>
        </div>
      </div>

      {/* Explanation */}
      <p className="text-2xs text-white/30 mt-3">
        Рейтинг зависит от % отправленных заказов за рабочие дни. Выше 80% — ставка растёт быстрее.
      </p>
    </motion.div>
  );
}
