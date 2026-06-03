"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { LEVELS, LEVEL_COLORS } from "@/lib/constants/levels";

export interface LevelProgressProps {
  level: number;
  completedOrders: number;
  isVibePlus?: boolean;
  className?: string;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const nodeVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.3 } },
};

const lineVariants = {
  hidden: { scaleX: 0 },
  visible: { scaleX: 1, transition: { duration: 0.4, ease: "easeOut" } },
};

export function LevelProgress({
  level,
  completedOrders,
  isVibePlus,
  className,
}: LevelProgressProps) {
  const effectiveLevel = isVibePlus ? 3 : level;
  const currentLevelConfig = LEVELS[effectiveLevel];
  const nextLevel = LEVELS[effectiveLevel + 1];
  const currentColors = LEVEL_COLORS[effectiveLevel];
  const pathRef = useRef<HTMLDivElement>(null);
  const currentNodeRef = useRef<HTMLDivElement>(null);

  const ordersInCurrentLevel = Math.max(0, completedOrders - currentLevelConfig.ordersRequired);
  const ordersToNext = nextLevel ? nextLevel.ordersRequired - completedOrders : 0;

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

  // Прогресс бара = прогресс от текущего уровня к следующему
  const barProgress = progressPercent;

  // Auto-scroll к текущему уровню на мобильных
  useEffect(() => {
    if (currentNodeRef.current && pathRef.current) {
      const container = pathRef.current;
      if (container.scrollWidth > container.clientWidth) {
        currentNodeRef.current.scrollIntoView({ inline: "center", behavior: "smooth" });
      }
    }
  }, [effectiveLevel]);

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
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 mb-5 relative">
        <h3 className="text-lg font-bold text-white">Путь Воина</h3>
        {!isVibePlus && nextLevel ? (
          <span className="text-sm text-white/40">
            {ordersToNext} {getOrdersWord(ordersToNext)} до {nextLevel.level}-го уровня
          </span>
        ) : (
          <span className="text-sm text-accent-green/60">Максимальный уровень</span>
        )}
      </div>

      {/* Progress bar with milestones */}
      <div className="mb-6">
        <div className="relative">
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
              animate={{ width: `${barProgress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full relative overflow-hidden"
              style={{
                background: `linear-gradient(to right, ${currentColors.barGradient})`,
                boxShadow: `0 0 12px ${currentColors.barShadow}`,
              }}
            >
              {/* Shimmer overlay */}
              <div
                className="absolute inset-0 animate-shimmer"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                }}
              />
            </motion.div>
          </div>

          {/* Level-to-level markers */}
          {nextLevel && (
            <div className="flex justify-between mt-2">
              <span className="text-xs text-white/40">
                {currentLevelConfig.ordersRequired} заказов
              </span>
              <span className="text-xs text-white/40">{nextLevel.ordersRequired} заказов</span>
            </div>
          )}
        </div>
      </div>

      {/* Horizontal path */}
      <motion.div
        ref={pathRef}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex items-center overflow-x-auto snap-x snap-mandatory py-4 -my-2 -mx-2 px-2 scrollbar-hide"
      >
        {LEVELS.map((l, i) => {
          const colors = LEVEL_COLORS[l.level];
          const isCurrent = l.level === effectiveLevel;
          const isPast = l.level < effectiveLevel;
          const isFuture = l.level > effectiveLevel;

          return (
            <div key={l.level} className="contents">
              {/* Connecting line (before each node except first) */}
              {i > 0 && (
                <motion.div
                  variants={lineVariants}
                  className={cn("h-[2px] flex-1 min-w-[24px] mx-1 rounded-full origin-left")}
                  style={
                    isPast || isCurrent
                      ? {
                          background: `linear-gradient(to right, ${LEVEL_COLORS[Math.max(0, l.level - 1)].barGradient})`,
                          boxShadow: `0 0 6px ${LEVEL_COLORS[Math.max(0, l.level - 1)].barShadow}`,
                        }
                      : {
                          backgroundImage:
                            "repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0, rgba(255,255,255,0.1) 4px, transparent 4px, transparent 8px)",
                        }
                  }
                />
              )}

              {/* Level node */}
              <motion.div
                ref={isCurrent ? currentNodeRef : undefined}
                variants={nodeVariants}
                className={cn(
                  "flex-shrink-0 flex flex-col items-center snap-center",
                  isFuture && "opacity-40"
                )}
              >
                {/* Circle */}
                <div className="relative">
                  {/* Glow for current level */}
                  {isCurrent && (
                    <div
                      className="absolute -inset-2 rounded-full"
                      style={{
                        background: `radial-gradient(circle, ${colors.barShadow}, transparent 70%)`,
                        animation: "breathing-glow 3s ease-in-out infinite",
                      }}
                    />
                  )}

                  <div
                    className={cn(
                      "relative flex items-center justify-center rounded-full border-2",
                      isCurrent ? "w-12 h-12" : "w-10 h-10",
                      isFuture && "border-dashed border-white/15",
                      !isFuture && colors.border
                    )}
                    style={
                      isPast || isCurrent
                        ? { background: `linear-gradient(135deg, ${colors.bgGradient})` }
                        : undefined
                    }
                  >
                    {isPast ? (
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : isCurrent ? (
                      <span className="text-lg">{l.emoji}</span>
                    ) : (
                      <span className="text-sm text-white/20">🔒</span>
                    )}
                  </div>
                </div>

                {/* Name */}
                <p
                  className={cn(
                    "text-2xs font-medium mt-1.5 text-center leading-tight whitespace-nowrap",
                    isCurrent ? colors.text : isPast ? "text-white/60" : "text-white/30"
                  )}
                >
                  {l.name}
                </p>

                {/* Orders required */}
                <p className="text-2xs text-white/20 mt-0.5 leading-tight">{l.ordersRequired}+</p>
              </motion.div>
            </div>
          );
        })}
      </motion.div>

      {/* Current level detail card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className={cn("mt-4 p-4 rounded-xl", "border", currentColors.border)}
        style={{
          background: `linear-gradient(to bottom right, ${currentColors.bgGradient})`,
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{currentLevelConfig.emoji}</span>
          <div>
            <p className={cn("text-sm font-semibold", currentColors.text)}>
              {isVibePlus ? "+ВАЙБ" : currentLevelConfig.name}
              <span className="text-white/40 font-normal"> — {currentLevelConfig.description}</span>
            </p>
            <p className="text-xs text-white/40 mt-0.5">
              {currentLevelConfig.discount > 0
                ? `Скидка на подписку: ${currentLevelConfig.discount}%`
                : "Скидок пока нет"}
            </p>
          </div>
        </div>
        {/* Motivational quote */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-xs text-white/40 italic mt-2"
        >
          &ldquo;{currentLevelConfig.quote}&rdquo;
        </motion.p>
      </motion.div>

      {/* Max level badge */}
      {(level === 3 || isVibePlus) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className={cn(
            "mt-3 p-3 rounded-xl",
            "bg-gradient-to-br from-accent-green/15 to-accent-green/5",
            "border border-accent-green/25",
            "shadow-[0_4px_16px_rgba(52,199,89,0.15)]"
          )}
        >
          <p className="text-sm text-accent-green font-semibold text-center">
            🔥 Воин Дракона — путь пройден!
          </p>
        </motion.div>
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
      <div className="h-6 w-32 bg-white/10 rounded mb-5" />
      <div className="mb-6 h-3 rounded-full bg-white/[0.08] border border-glass-subtle" />
      <div className="flex items-center gap-4 justify-center py-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-full bg-white/10" />
            <div className="h-3 w-12 bg-white/10 rounded" />
          </div>
        ))}
      </div>
      <div className="mt-4 h-16 rounded-xl bg-white/[0.05] border border-glass-subtle" />
    </div>
  );
}
