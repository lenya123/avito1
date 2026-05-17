"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import type { AnalyticsResponse } from "@/hooks/use-analytics";

interface ProgressBlockProps {
  progress: AnalyticsResponse["progress"];
  className?: string;
}

const LEVEL_NAMES: Record<number, string> = {
  0: "Новичок",
  1: "Продавец",
  2: "Профи",
  3: "Эксперт",
};

function getOrdersWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "заказов";
  if (lastDigit === 1) return "заказ";
  if (lastDigit >= 2 && lastDigit <= 4) return "заказа";
  return "заказов";
}

function getDaysWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "дней";
  if (lastDigit === 1) return "день";
  if (lastDigit >= 2 && lastDigit <= 4) return "дня";
  return "дней";
}

export function ProgressBlock({ progress, className }: ProgressBlockProps) {
  // Progress percent
  const LEVEL_THRESHOLDS = [0, 15, 30, 50];
  const current = LEVEL_THRESHOLDS[progress.level] || 0;
  const next = progress.nextLevel !== null ? LEVEL_THRESHOLDS[progress.nextLevel] : null;
  const progressPercent =
    next !== null && next > current
      ? Math.min(100, Math.max(0, ((progress.completedOrders - current) / (next - current)) * 100))
      : 100;

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

      <div className="relative">
        {/* Level section */}
        <div className="p-6 pb-5">
          <h3 className="text-lg font-semibold text-white mb-4">Прогресс</h3>

          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-accent-blue">
              Уровень {progress.level}: {LEVEL_NAMES[progress.level] || ""}
            </span>
            {progress.ordersToNextLevel !== null && progress.ordersToNextLevel > 0 && (
              <span className="text-xs text-white/40">
                {progress.ordersToNextLevel} {getOrdersWord(progress.ordersToNextLevel)} до ур.{" "}
                {progress.nextLevel}
              </span>
            )}
            {progress.level === 3 && <span className="text-xs text-accent-green">Максимум</span>}
          </div>

          {/* Progress bar */}
          <div
            className={cn(
              "h-2.5 rounded-full overflow-hidden",
              "bg-white/[0.15]",
              "border border-glass-minimal"
            )}
          >
            <motion.div
              className="h-full rounded-r-full bg-accent-blue border-r-2 border-accent-blue/30"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>

          {/* Estimated time + next discount */}
          <div className="flex items-center justify-between mt-2">
            {progress.estimatedDaysToNextLevel !== null &&
              progress.estimatedDaysToNextLevel > 0 && (
                <span className="text-xs text-white/40">
                  ~{progress.estimatedDaysToNextLevel}{" "}
                  {getDaysWord(progress.estimatedDaysToNextLevel)}
                </span>
              )}
            {progress.nextDiscountPercent !== null && (
              <span className="text-xs text-white/40">
                Скидка: {progress.discountPercent}% → {progress.nextDiscountPercent}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProgressBlockSkeleton() {
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
      <div className="p-6 pb-5">
        <div className="h-6 w-24 bg-white/10 rounded mb-4" />
        <div className="flex justify-between mb-2">
          <div className="h-4 w-32 bg-white/10 rounded" />
          <div className="h-4 w-28 bg-white/10 rounded" />
        </div>
        <div className="h-2.5 bg-white/[0.08] rounded-full border border-glass-subtle" />
      </div>
    </div>
  );
}
