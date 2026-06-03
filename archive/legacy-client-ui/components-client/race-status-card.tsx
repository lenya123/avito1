"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { useAnimatedNumber } from "@/hooks/use-animated-number";

export interface RaceStatusCardProps {
  rank: number | null;
  rankChange: number | null;
  totalParticipants: number;
  ordersCount: number;
  ordersToNextRank: number | null;
  balance: number;
  periodEnd: string;
  className?: string;
}

function useCountdown(periodEnd: string) {
  const [remaining, setRemaining] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    function update() {
      const diff = new Date(periodEnd).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Завершено");
        setIsUrgent(false);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;

      if (days > 0) {
        setRemaining(`${days}д ${remainingHours}ч`);
        setIsUrgent(false);
      } else {
        setRemaining(`${hours}ч ${minutes}м`);
        setIsUrgent(true);
      }
    }

    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [periodEnd]);

  return { remaining, isUrgent };
}

export function RaceStatusCard({
  rank,
  rankChange,
  totalParticipants,
  ordersCount,
  ordersToNextRank,
  balance,
  periodEnd,
  className,
}: RaceStatusCardProps) {
  const { remaining, isUrgent } = useCountdown(periodEnd);

  const animatedBalance = useAnimatedNumber(balance, {
    format: (n) => n.toLocaleString("ru-RU") + " ₽",
  });

  const progressPercent = useMemo(() => {
    if (!rank || totalParticipants <= 1) return 0;
    return ((totalParticipants - rank) / Math.max(totalParticipants - 1, 1)) * 100;
  }, [rank, totalParticipants]);

  const ctaText = useMemo(() => {
    if (!rank) return null;
    if (rank === 1) return "Ты лидер! 🔥";
    if (ordersToNextRank !== null) {
      return `Ещё ${ordersToNextRank} и ты #${rank - 1}!`;
    }
    return `${ordersCount} заказов на этой неделе`;
  }, [rank, ordersToNextRank, ordersCount]);

  // Фон зависит от зоны
  const bgOverlay = useMemo(() => {
    if (!rank) return "rgba(255,255,255,0.03)";
    if (rank === 1) return "rgba(255,180,50,0.12)";
    if (rank === 2) return "rgba(192,192,210,0.10)";
    if (rank === 3) return "rgba(205,127,50,0.10)";
    if (rank <= 10) return "rgba(255,255,255,0.06)";
    return "rgba(255,255,255,0.03)";
  }, [rank]);

  // Пустое состояние — нет ранга
  if (rank === null) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={cn(
          "md:hidden mb-4 p-4 rounded-2xl overflow-hidden relative",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "backdrop-blur-xl border border-glass shadow-card",
          className
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🏆</span>
              <span className="text-sm font-semibold text-white/80">Гонка недели</span>
            </div>
            <p className="text-xs text-white/40">Сделай заказ и попади в рейтинг!</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/40">Баланс</p>
            <p className="text-lg font-semibold text-white tabular-nums">{animatedBalance}</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className={cn(
        "md:hidden mb-4 p-4 rounded-2xl overflow-hidden relative",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card",
        className
      )}
    >
      {/* Градиент зоны */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at top left, ${bgOverlay}, transparent 70%)`,
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative">
        {/* Заголовок: Гонка недели + Обратный отсчёт */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🏆</span>
            <span className="text-sm font-semibold text-white/80">Гонка недели</span>
          </div>
          {isUrgent ? (
            <motion.span
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-xs text-accent-orange font-medium"
            >
              {remaining}
            </motion.span>
          ) : (
            <span className="text-xs text-white/40">{remaining}</span>
          )}
        </div>

        {/* Ранг + Баланс */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-white tabular-nums">#{rank}</span>
              {rankChange !== null && rankChange !== 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: [1.2, 1] }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 300, damping: 20 }}
                  className={cn(
                    "text-sm font-medium",
                    rankChange > 0 ? "text-accent-green" : "text-accent-red"
                  )}
                >
                  {rankChange > 0 ? `▲${rankChange}` : `▼${Math.abs(rankChange)}`}
                </motion.span>
              )}
            </div>
            <p className="text-xs text-white/40 mt-0.5">из {totalParticipants} участников</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/40">Баланс</p>
            <p className="text-lg font-semibold text-white tabular-nums">{animatedBalance}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-1 bg-white/[0.06] rounded-full mb-3">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ delay: 0.2, duration: 0.6, ease: "easeOut" }}
            className="absolute inset-y-0 left-0 bg-accent-orange/60 rounded-full"
          />
          <motion.div
            initial={{ left: 0, opacity: 0 }}
            animate={{ left: `${progressPercent}%`, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.4, ease: "easeOut" }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.4)]"
          />
        </div>

        {/* CTA */}
        {ctaText && (
          <p className="text-xs text-white/60">
            {ordersCount} {getOrdersWord(ordersCount)} ·{" "}
            <span className="text-white/40">{ctaText}</span>
          </p>
        )}
      </div>
    </motion.div>
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
export function RaceStatusCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "md:hidden mb-4 p-4 rounded-2xl overflow-hidden relative animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass shadow-card",
        className
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-white/10" />
          <div className="h-4 w-24 bg-white/10 rounded" />
        </div>
        <div className="h-3 w-12 bg-white/10 rounded" />
      </div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="h-7 w-12 bg-white/10 rounded mb-1" />
          <div className="h-3 w-20 bg-white/10 rounded" />
        </div>
        <div className="text-right">
          <div className="h-3 w-10 bg-white/10 rounded mb-1 ml-auto" />
          <div className="h-5 w-16 bg-white/10 rounded" />
        </div>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full mb-3" />
      <div className="h-3 w-32 bg-white/10 rounded" />
    </div>
  );
}
