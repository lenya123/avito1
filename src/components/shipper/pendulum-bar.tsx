"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";

// ─── Types ──────────────────────────────────────────────────────────

export interface PendulumData {
  /** Overall score from -100 to +100 */
  score: number;
  /** Volume metric: % of daily target shipped */
  volumePercent: number;
  /** Daily target (avg orders per day in system) */
  dailyTarget: number;
  /** Speed metric: avg hours to ship/pickup (lower = better) */
  avgHours: number;
  /** Speed target in hours (e.g. 24) */
  speedTargetHours: number;
  /** Current rate based on score */
  currentRate: number;
  /** Rate boundaries set by owner */
  rateMin: number;
  rateBase: number;
  rateMax: number;
}

interface PendulumBarProps {
  data: PendulumData;
}

// ─── Helpers ────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

/** Map score (-100..+100) to a color. Negative = red/orange, positive = green */
function scoreColor(score: number): {
  text: string;
  glow: string;
  glowSolid: string;
  badge: string;
} {
  if (score >= 50) {
    return {
      text: "text-accent-green",
      glow: "rgba(48,209,88,0.4)",
      glowSolid: "#30D158",
      badge: "bg-accent-green/15 text-accent-green border-accent-green/20",
    };
  }
  if (score >= 0) {
    return {
      text: "text-accent-teal",
      glow: "rgba(100,210,255,0.3)",
      glowSolid: "#64D2FF",
      badge: "bg-accent-teal/15 text-accent-teal border-accent-teal/20",
    };
  }
  if (score >= -50) {
    return {
      text: "text-accent-orange",
      glow: "rgba(255,159,10,0.4)",
      glowSolid: "#FF9F0A",
      badge: "bg-accent-orange/15 text-accent-orange border-accent-orange/20",
    };
  }
  return {
    text: "text-accent-red",
    glow: "rgba(255,69,58,0.4)",
    glowSolid: "#FF453A",
    badge: "bg-accent-red/15 text-accent-red border-accent-red/20",
  };
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Отлично";
  if (score >= 50) return "Хорошо";
  if (score >= 0) return "Норма";
  if (score >= -50) return "Ниже нормы";
  return "Критично";
}

// ─── Metric Pill ────────────────────────────────────────────────────

function MetricPill({ label, value, isGood }: { label: string; value: string; isGood: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-xl",
        "border",
        isGood
          ? "bg-accent-green/10 border-accent-green/20"
          : "bg-accent-orange/10 border-accent-orange/20"
      )}
    >
      <div
        className={cn("w-1.5 h-1.5 rounded-full", isGood ? "bg-accent-green" : "bg-accent-orange")}
        style={{
          boxShadow: isGood ? "0 0 6px rgba(48,209,88,0.6)" : "0 0 6px rgba(255,159,10,0.6)",
        }}
      />
      <span className="text-2xs text-white/60">{label}</span>
      <span
        className={cn(
          "text-2xs font-semibold",
          isGood ? "text-accent-green" : "text-accent-orange"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Pendulum Visual ────────────────────────────────────────────────

function PendulumTrack({ score }: { score: number }) {
  const clamped = clamp(score, -100, 100);
  const colors = scoreColor(clamped);

  const fillPercent = Math.abs(clamped) / 2; // 0–50% of total width
  const isNegative = clamped < 0;
  const isZero = clamped === 0;

  return (
    <div className="relative py-1">
      {/* Glow behind track — colored ambient light */}
      {!isZero && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
          className="absolute inset-0 rounded-2xl"
          style={{
            background: isNegative
              ? `radial-gradient(ellipse at ${50 - fillPercent / 2}% 50%, ${colors.glow}, transparent 60%)`
              : `radial-gradient(ellipse at ${50 + fillPercent / 2}% 50%, ${colors.glow}, transparent 60%)`,
            filter: "blur(8px)",
            opacity: 0.5,
          }}
        />
      )}

      {/* Track container — frosted glass */}
      <div
        className={cn(
          "relative h-5 rounded-2xl overflow-hidden",
          "backdrop-blur-sm",
          "border border-white/[0.08]"
        )}
        style={{
          background: "linear-gradient(to bottom, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
          boxShadow:
            "inset 0 1px 2px rgba(0,0,0,0.3), inset 0 -1px 0 rgba(255,255,255,0.03), 0 1px 0 rgba(255,255,255,0.02)",
        }}
      >
        {/* Fill — grows from center, flat edge */}
        {!isZero && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${fillPercent}%` }}
            transition={{ duration: 0.9, ease: [0.25, 1, 0.5, 1] }}
            className="absolute inset-y-0"
            style={{
              [isNegative ? "right" : "left"]: "50%",
              background: isNegative
                ? `linear-gradient(to left, ${colors.glowSolid}08, ${colors.glowSolid}80)`
                : `linear-gradient(to right, ${colors.glowSolid}08, ${colors.glowSolid}80)`,
            }}
          />
        )}

        {/* Center mark */}
        <div
          className="absolute left-1/2 -translate-x-px top-0 bottom-0"
          style={{
            width: "2px",
            background: "rgba(255,255,255,0.4)",
            borderRadius: "1px",
          }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

// ─── How It's Calculated ────────────────────────────────────────────

function HowCalculated({ data }: { data: PendulumData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 mt-3 text-xs text-white/40 active:text-white/60 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>Как посчитали</span>
        <motion.svg
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-3 border-t border-white/[0.06] space-y-3">
              {/* Score explanation */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-white/60">Рейтинг</h4>
                <p className="text-xs text-white/40 leading-relaxed">
                  Шкала от −100 до +100. Центр (0) = базовая ставка{" "}
                  <span className="text-white/60">{formatPrice(data.rateBase)}</span>. Чем выше
                  рейтинг — тем больше ставка, максимум{" "}
                  <span className="text-accent-green">{formatPrice(data.rateMax)}</span>. При
                  падении — минимум{" "}
                  <span className="text-accent-red">{formatPrice(data.rateMin)}</span>.
                </p>
              </div>

              {/* Two factors */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-white/60">Два показателя</h4>

                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent-blue mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-white/60">
                        <span className="font-medium text-white/80">Объём</span> — сколько заказов
                        отправил от дневной нормы ({data.dailyTarget} шт). Норма считается
                        автоматически из среднего потока заказов.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent-blue mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-white/60">
                        <span className="font-medium text-white/80">Скорость</span> — как быстро
                        отправляешь заказы и забираешь возвраты. Цель — до {data.speedTargetHours}ч.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* What affects */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-white/60">Что влияет</h4>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-accent-green/[0.06] border border-accent-green/[0.12] p-2.5">
                    <p className="text-2xs font-medium text-accent-green mb-1">Рейтинг растёт</p>
                    <ul className="space-y-0.5">
                      <li className="text-2xs text-white/40">Отправляешь больше нормы</li>
                      <li className="text-2xs text-white/40">Быстро отдаёшь в ПВЗ</li>
                      <li className="text-2xs text-white/40">Быстро забираешь возвраты</li>
                    </ul>
                  </div>
                  <div className="rounded-xl bg-accent-red/[0.06] border border-accent-red/[0.12] p-2.5">
                    <p className="text-2xs font-medium text-accent-red mb-1">Рейтинг падает</p>
                    <ul className="space-y-0.5">
                      <li className="text-2xs text-white/40">Отправляешь мало заказов</li>
                      <li className="text-2xs text-white/40">Долго не отдаёшь в ПВЗ</li>
                      <li className="text-2xs text-white/40">Не забираешь возвраты</li>
                      <li className="text-2xs text-white/40">Не работаешь в рабочий день</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Key rule */}
              <div className="flex gap-2 px-3 py-2 rounded-xl bg-accent-orange/[0.08] border border-accent-orange/20">
                <svg
                  className="w-4 h-4 text-accent-orange flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <p className="text-xs text-white/60 leading-relaxed">
                  Уронить рейтинг легче, чем поднять. Стабильная работа каждый день — ключ к
                  максимальной ставке.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function PendulumBar({ data }: PendulumBarProps) {
  const { score, volumePercent, dailyTarget, avgHours, speedTargetHours, currentRate } = data;

  const clamped = clamp(score, -100, 100);
  const colors = scoreColor(clamped);
  const label = scoreLabel(clamped);

  const volumeGood = volumePercent >= 70;
  const speedGood = avgHours <= speedTargetHours;

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
      {/* Header: score + rate */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <motion.span
            key={clamped}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn("text-2xl font-bold", colors.text)}
            style={{ textShadow: `0 0 16px ${colors.glow}` }}
          >
            {clamped > 0 ? "+" : ""}
            {clamped}
          </motion.span>
          <span className={cn("text-xs font-medium", colors.text, "opacity-60")}>{label}</span>
        </div>
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", colors.badge)}>
          {formatPrice(currentRate)} / заказ
        </span>
      </div>

      {/* Pendulum track */}
      <PendulumTrack score={clamped} />

      {/* Metrics */}
      <div className="flex items-center gap-2 mt-3">
        <MetricPill
          label="Объём"
          value={`${Math.round(volumePercent)}% от ${dailyTarget}`}
          isGood={volumeGood}
        />
        <MetricPill label="Скорость" value={`${avgHours.toFixed(1)}ч`} isGood={speedGood} />
      </div>

      {/* How it's calculated */}
      <HowCalculated data={data} />
    </motion.div>
  );
}
