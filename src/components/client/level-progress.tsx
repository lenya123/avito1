"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

export interface LevelProgressProps {
  level: number;
  completedOrders: number;
  isVibePlus?: boolean;
  className?: string;
}

const LEVELS = [
  { level: 0, ordersRequired: 0, discount: 0, name: "Новичок" },
  { level: 1, ordersRequired: 15, discount: 3, name: "Продавец" },
  { level: 2, ordersRequired: 30, discount: 6, name: "Профи" },
  { level: 3, ordersRequired: 50, discount: 10, name: "Эксперт" },
];

// Прогрессия от белого к accent blue (#0A84FF)
// RGBA значения для inline styles (Tailwind JIT не компилирует динамические классы)
const LEVEL_COLORS = [
  {
    bgGradient: "rgba(255,255,255,0.10), rgba(255,255,255,0.05)", // белый
    barGradient: "rgba(255,255,255,0.50), rgba(255,255,255,0.30)", // белый для прогресс-бара
    barShadow: "rgba(255,255,255,0.3)",
    text: "text-white",
    border: "border-glass-subtle",
  },
  {
    bgGradient:
      "color-mix(in srgb, var(--level-1-color) 15%, transparent), color-mix(in srgb, var(--level-1-color) 8%, transparent)", // level-1
    barGradient:
      "color-mix(in srgb, var(--level-1-color) 70%, transparent), color-mix(in srgb, var(--level-1-color) 45%, transparent)",
    barShadow: "color-mix(in srgb, var(--level-1-color) 40%, transparent)",
    text: "text-level-1",
    border: "border-level-1/20",
  },
  {
    bgGradient:
      "color-mix(in srgb, var(--level-2-color) 20%, transparent), color-mix(in srgb, var(--level-2-color) 12%, transparent)", // level-2
    barGradient:
      "color-mix(in srgb, var(--level-2-color) 85%, transparent), color-mix(in srgb, var(--level-2-color) 60%, transparent)",
    barShadow: "color-mix(in srgb, var(--level-2-color) 50%, transparent)",
    text: "text-level-2",
    border: "border-level-2/25",
  },
  {
    bgGradient: "rgba(10,132,255,0.30), rgba(10,132,255,0.18)", // #0A84FF
    barGradient: "rgba(10,132,255,1), rgba(10,132,255,0.80)",
    barShadow: "rgba(10,132,255,0.6)",
    text: "text-accent-blue",
    border: "border-accent-blue/35",
  },
];

export function LevelProgress({
  level,
  completedOrders,
  isVibePlus,
  className,
}: LevelProgressProps) {
  // +ВАЙБ автоматически = уровень 3
  const effectiveLevel = isVibePlus ? 3 : level;
  const currentLevelConfig = LEVELS[effectiveLevel];
  const nextLevel = LEVELS[effectiveLevel + 1];
  const currentColors = LEVEL_COLORS[effectiveLevel];

  // Calculate progress to next level
  // +ВАЙБ = автоматически 100% (максимальный уровень)
  // Для текущего уровня: сколько заказов уже выполнено в рамках этого уровня
  const ordersInCurrentLevel = Math.max(0, completedOrders - currentLevelConfig.ordersRequired);
  const ordersToNext = nextLevel ? nextLevel.ordersRequired - completedOrders : 0;

  // Прогресс от 0% до 100% в рамках текущего уровня
  // +ВАЙБ всегда 100% независимо от заказов
  const progressPercent = isVibePlus
    ? 100
    : nextLevel
      ? Math.max(
          0,
          Math.min(
            100,
            (ordersInCurrentLevel /
              (nextLevel.ordersRequired - currentLevelConfig.ordersRequired)) *
              100
          )
        )
      : 100;

  return (
    <div
      className={cn(
        "relative p-6 rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card",
        className
      )}
    >
      {/* Декоративный блик */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <h3 className="text-lg font-bold text-white mb-4 relative">Система уровней</h3>

      {/* Progress bar */}
      <div
        className={cn(
          "mb-6 p-4 rounded-xl",
          "bg-gradient-to-br from-white/[0.06] to-white/[0.02]",
          "border border-glass-subtle"
        )}
      >
        <div className="flex justify-between mb-3">
          <span
            className={cn(
              "text-sm font-medium",
              isVibePlus ? "text-accent-green" : currentColors.text
            )}
          >
            {isVibePlus
              ? "+ВАЙБ (Уровень 3)"
              : `Уровень ${effectiveLevel}: ${currentLevelConfig.name}`}
          </span>
          {!isVibePlus && nextLevel && (
            <span className="text-sm text-white/40">
              {ordersToNext} {getOrdersWord(ordersToNext)} до уровня {nextLevel.level}
            </span>
          )}
          {isVibePlus && <span className="text-sm text-accent-green/60">Максимальный уровень</span>}
        </div>
        <div
          className={cn(
            "h-3 rounded-full overflow-hidden",
            "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
            "border border-glass-subtle",
            "shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]"
          )}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(to right, ${currentColors.barGradient})`,
              boxShadow: `0 0 12px ${currentColors.barShadow}`,
            }}
          />
        </div>
        {nextLevel && (
          <div className="flex justify-between mt-2">
            <span className="text-xs text-white/40">
              {currentLevelConfig.ordersRequired} заказов
            </span>
            <span className="text-xs text-white/40">{nextLevel.ordersRequired} заказов</span>
          </div>
        )}
      </div>

      {/* Levels grid */}
      <div className="grid grid-cols-4 gap-2">
        {LEVELS.map((l) => {
          const colors = LEVEL_COLORS[l.level];
          const isCurrent = l.level === effectiveLevel;
          const isPast = l.level < effectiveLevel;
          const isFuture = l.level > effectiveLevel;
          const isReached = l.level <= effectiveLevel;

          return (
            <div
              key={l.level}
              className={cn(
                "relative p-3 rounded-xl text-center transition-all overflow-hidden",
                "border",
                isCurrent && [colors.border, "shadow-card"],
                isPast && !isCurrent && "border-glass-subtle",
                isFuture && ["border-glass-subtle", "opacity-50"]
              )}
              style={
                isCurrent
                  ? {
                      background: `linear-gradient(to bottom right, ${colors.bgGradient})`,
                    }
                  : isPast
                    ? {
                        background:
                          "linear-gradient(to bottom right, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                      }
                    : {
                        background:
                          "linear-gradient(to bottom right, rgba(255,255,255,0.03), transparent)",
                      }
              }
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-xl mx-auto mb-2 flex items-center justify-center text-lg font-bold",
                  "border",
                  "shadow-glass-inset",
                  isReached ? colors.text : "text-white/40",
                  isReached ? colors.border : "border-glass-subtle"
                )}
                style={
                  isReached
                    ? {
                        background: `linear-gradient(to bottom right, ${colors.bgGradient})`,
                      }
                    : {
                        background:
                          "linear-gradient(to bottom right, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
                      }
                }
              >
                {l.level}
              </div>
              <p className={cn("text-xs font-medium", isCurrent ? colors.text : "text-white/60")}>
                {l.name}
              </p>
              <p className={cn("text-xs mt-0.5", isCurrent ? "text-white/60" : "text-white/40")}>
                {l.discount > 0 ? `${l.discount}% скидка` : "0%"}
              </p>
              <p className="text-2xs text-white/20 mt-1">{l.ordersRequired}+ заказов</p>
            </div>
          );
        })}
      </div>

      {/* Max level badge */}
      {level === 3 && (
        <div
          className={cn(
            "mt-4 p-4 rounded-xl",
            "bg-gradient-to-br from-accent-green/15 to-accent-green/5",
            "border border-accent-green/25",
            "shadow-[0_4px_16px_rgba(52,199,89,0.15)]"
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                "bg-gradient-to-br from-accent-green/25 to-accent-green/15",
                "border border-accent-green/30"
              )}
            >
              <span className="text-xl">🏆</span>
            </div>
            <p className="text-sm text-accent-green font-semibold">
              Максимальный уровень достигнут!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function getOrdersWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "заказов";
  if (lastDigit === 1) return "заказ";
  if (lastDigit >= 2 && lastDigit <= 4) return "заказа";
  return "заказов";
}

// Skeleton
export function LevelProgressSkeleton() {
  return (
    <div
      className={cn(
        "relative p-6 rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass",
        "shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="h-6 w-32 bg-white/10 rounded mb-4" />
      <div className="mb-6 p-4 rounded-xl bg-white/[0.05] border border-glass-subtle">
        <div className="flex justify-between mb-3">
          <div className="h-4 w-24 bg-white/10 rounded" />
          <div className="h-4 w-32 bg-white/10 rounded" />
        </div>
        <div className="h-3 rounded-full bg-white/[0.08] border border-glass-subtle" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="p-3 rounded-xl bg-white/[0.05] border border-glass-subtle">
            <div className="w-9 h-9 rounded-xl bg-white/10 mx-auto mb-2" />
            <div className="h-3 w-12 bg-white/10 rounded mx-auto mb-1" />
            <div className="h-3 w-16 bg-white/10 rounded mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
