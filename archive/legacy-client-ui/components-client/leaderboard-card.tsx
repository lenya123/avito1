"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import type { LeaderboardEntry } from "@/hooks/use-stats";

export interface LeaderboardCardProps {
  leaderboard: LeaderboardEntry[];
  currentUserRank: number | null;
  currentUserEntry: LeaderboardEntry | null;
  totalParticipants: number;
  periodEnd?: string;
  promotionCutoff?: number;
  demotionCutoff?: number;
  isLoading?: boolean;
  className?: string;
}

const PODIUM_CONFIG: Record<number, { color: string; shadow: string; borderColor: string }> = {
  1: {
    color: "text-accent-orange",
    shadow: "0 0 16px rgba(255,159,10,0.4)",
    borderColor: "border-accent-orange",
  },
  2: {
    color: "text-white/60",
    shadow: "0 0 8px rgba(255,255,255,0.15)",
    borderColor: "border-white/40",
  },
  3: {
    color: "text-accent-orange/60",
    shadow: "0 0 8px rgba(255,159,10,0.15)",
    borderColor: "border-accent-orange/40",
  },
};

// Стили карточек по рангу — золото/серебро/бронза для топ-3, акцент для топа, серый для остальных
function getRankStyle(rank: number, totalInTop: number): string {
  switch (rank) {
    case 1:
      return "bg-gradient-to-r from-[rgba(255,180,50,0.15)] to-[rgba(255,180,50,0.05)] border border-[rgba(255,180,50,0.25)]";
    case 2:
      return "bg-gradient-to-r from-[rgba(192,192,210,0.12)] to-[rgba(192,192,210,0.04)] border border-[rgba(192,192,210,0.20)]";
    case 3:
      return "bg-gradient-to-r from-[rgba(205,127,50,0.12)] to-[rgba(205,127,50,0.04)] border border-[rgba(205,127,50,0.20)]";
    default:
      if (rank <= totalInTop) {
        return "bg-gradient-to-r from-white/[0.06] to-white/[0.02] border border-glass-subtle";
      }
      return "bg-white/[0.03]";
  }
}

function useCountdown(periodEnd?: string) {
  const [remaining, setRemaining] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!periodEnd) return;

    function update() {
      const diff = new Date(periodEnd!).getTime() - Date.now();
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

export function LeaderboardCard({
  leaderboard,
  currentUserRank,
  currentUserEntry,
  totalParticipants,
  periodEnd,
  isLoading,
  className,
}: LeaderboardCardProps) {
  const { remaining, isUrgent } = useCountdown(periodEnd);

  if (isLoading) {
    return <LeaderboardCardSkeleton className={className} />;
  }

  const hasParticipants = leaderboard.length > 0;
  const hasEnoughForPodium = leaderboard.length >= 3;
  const isUserInTop3 = currentUserRank !== null && currentUserRank <= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
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

      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <h3 className="text-sm font-semibold text-white">Гонка недели</h3>
          </div>
          {remaining ? (
            isUrgent ? (
              <motion.span
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-xs text-accent-orange font-medium"
              >
                {remaining}
              </motion.span>
            ) : (
              <span className="text-xs text-white/40">{remaining}</span>
            )
          ) : (
            totalParticipants > 0 && (
              <span className="text-xs text-white/40">{totalParticipants} участников</span>
            )
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        {hasParticipants ? (
          <>
            {/* Podium for top 3 */}
            {hasEnoughForPodium && (
              <div className="grid grid-cols-3 items-end gap-2 mb-3">
                <PodiumPlace
                  entry={leaderboard[1]}
                  rank={2}
                  isCurrentUser={leaderboard[1]?.isCurrentUser}
                  animDelay={0.2}
                  animDirection="left"
                />
                <PodiumPlace
                  entry={leaderboard[0]}
                  rank={1}
                  isCurrentUser={leaderboard[0]?.isCurrentUser}
                  animDelay={0.1}
                  animDirection="up"
                />
                <PodiumPlace
                  entry={leaderboard[2]}
                  rank={3}
                  isCurrentUser={leaderboard[2]?.isCurrentUser}
                  animDelay={0.2}
                  animDirection="right"
                />
              </div>
            )}

            {/* Current user position (if not in top 3) */}
            {currentUserRank && !isUserInTop3 && currentUserEntry && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className={cn("mb-3 p-3 rounded-xl", "bg-white/[0.06] border border-glass-subtle")}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">#{currentUserRank}</span>
                    <span className="text-sm text-white">Твоя позиция</span>
                  </div>
                  <span className="text-xs text-white/40">
                    {currentUserEntry.ordersCount} {getOrdersWord(currentUserEntry.ordersCount)}
                  </span>
                </div>
                <div className="mt-2 relative h-1 rounded-full bg-white/[0.06]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.max(2, 100 - ((currentUserRank - 1) / totalParticipants) * 100)}%`,
                    }}
                    transition={{ delay: 0.5, duration: 0.6 }}
                    className="h-full rounded-full bg-white/20"
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/60"
                    style={{
                      left: `${Math.max(2, 100 - ((currentUserRank - 1) / totalParticipants) * 100)}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                </div>
              </motion.div>
            )}

            {/* Rows 4+ (or all rows if < 3 participants) */}
            <div className="space-y-1.5">
              {leaderboard.slice(hasEnoughForPodium ? 3 : 0).map((entry, index) => (
                <LeaderboardRow
                  key={entry.userId}
                  entry={entry}
                  index={index}
                  totalInTop={leaderboard.length}
                />
              ))}

              {/* Current user row if not in visible list */}
              {currentUserEntry && !isUserInTop3 && !leaderboard.some((e) => e.isCurrentUser) && (
                <>
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-[1px] bg-white/10" />
                    <span className="text-2xs text-white/20">···</span>
                    <div className="flex-1 h-[1px] bg-white/10" />
                  </div>
                  <LeaderboardRow entry={currentUserEntry} index={0} totalInTop={0} />
                </>
              )}
            </div>
          </>
        ) : (
          <div className="py-6 text-center">
            <div className="text-3xl mb-2">🏃</div>
            <p className="text-sm text-white/40">Гонка начнётся с первого заказа</p>
            <p className="text-xs text-white/20 mt-1">Сделай заказ и попади в рейтинг!</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function PodiumPlace({
  entry,
  rank,
  isCurrentUser,
  animDelay,
  animDirection,
}: {
  entry: LeaderboardEntry;
  rank: 1 | 2 | 3;
  isCurrentUser?: boolean;
  animDelay: number;
  animDirection: "up" | "left" | "right";
}) {
  if (!entry) return <div />;

  const config = PODIUM_CONFIG[rank];
  const initial =
    animDirection === "up"
      ? { opacity: 0, y: 20 }
      : animDirection === "left"
        ? { opacity: 0, x: -15 }
        : { opacity: 0, x: 15 };

  return (
    <motion.div
      initial={initial}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={
        rank === 1
          ? { type: "spring", bounce: 0.3, delay: animDelay }
          : { duration: 0.4, delay: animDelay }
      }
      className={cn("flex flex-col items-center text-center", rank === 1 ? "pt-0" : "pt-4")}
    >
      {/* Crown for 1st — wobbles */}
      {rank === 1 && (
        <motion.span
          animate={{ rotate: [-5, 5, -5] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          className="text-lg mb-1 inline-block"
        >
          🏆
        </motion.span>
      )}

      {/* Avatar circle */}
      <div
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2",
          config.borderColor,
          isCurrentUser ? "text-accent-blue" : "text-white",
          "bg-gradient-to-b from-white/[0.1] to-white/[0.05]",
          rank === 1 && "animate-breathing-glow"
        )}
        style={{ boxShadow: config.shadow }}
      >
        {entry.name.charAt(0).toUpperCase()}
      </div>

      {/* Name */}
      <p
        className={cn(
          "text-2xs mt-1.5 truncate max-w-full leading-tight",
          isCurrentUser ? "text-white font-medium" : "text-white/60"
        )}
      >
        {entry.name}
        {isCurrentUser && <span className="text-white/40"> (вы)</span>}
      </p>

      {/* Orders count */}
      <p className="text-xs font-bold text-white mt-0.5">{entry.ordersCount}</p>
      <p className="text-2xs text-white/20">{getOrdersWord(entry.ordersCount)}</p>
    </motion.div>
  );
}

function LeaderboardRow({
  entry,
  index,
  totalInTop,
}: {
  entry: LeaderboardEntry;
  index: number;
  totalInTop: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 + index * 0.05 }}
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-xl",
        getRankStyle(entry.rank, totalInTop)
      )}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold bg-white/10 text-white/60">
        {entry.rank}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-white">
          {entry.name}
          {entry.isCurrentUser && <span className="text-xs text-white/40 ml-1">(вы)</span>}
        </p>
      </div>

      <div className="text-center">
        <p className="text-sm font-bold text-white">{entry.ordersCount}</p>
        <p className="text-2xs text-white/40">{getOrdersWord(entry.ordersCount)}</p>
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

export function LeaderboardCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass",
        "shadow-card",
        className
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-white/10 rounded" />
            <div className="h-4 w-24 bg-white/10 rounded" />
          </div>
          <div className="h-3 w-14 bg-white/10 rounded" />
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="grid grid-cols-3 items-end gap-2 mb-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn("flex flex-col items-center", i !== 1 && "pt-4")}>
              <div className="w-9 h-9 rounded-full bg-white/10" />
              <div className="h-3 w-12 bg-white/10 rounded mt-1.5" />
              <div className="h-4 w-6 bg-white/10 rounded mt-1" />
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.03]">
              <div className="w-7 h-7 bg-white/10 rounded-lg" />
              <div className="flex-1">
                <div className="h-4 w-24 bg-white/10 rounded" />
              </div>
              <div className="h-4 w-8 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
