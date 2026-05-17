"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import type { LeaderboardEntry } from "@/hooks/use-stats";

export interface LeaderboardCardProps {
  leaderboard: LeaderboardEntry[];
  currentUserRank: number | null;
  currentUserEntry: LeaderboardEntry | null;
  totalParticipants: number;
  isLoading?: boolean;
  className?: string;
}

// Медали для топ-3
const RANK_MEDALS: Record<number, { emoji: string; color: string }> = {
  1: { emoji: "🥇", color: "from-accent-orange/20 to-accent-orange/10" },
  2: { emoji: "🥈", color: "from-white/20 to-white/10" },
  3: { emoji: "🥉", color: "from-accent-orange/15 to-accent-orange/5" },
};

export function LeaderboardCard({
  leaderboard,
  currentUserRank,
  currentUserEntry,
  totalParticipants,
  isLoading,
  className,
}: LeaderboardCardProps) {
  if (isLoading) {
    return <LeaderboardCardSkeleton className={className} />;
  }

  const hasParticipants = leaderboard.length > 0;

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
      {/* Декоративный блик */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Заголовок */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <h3 className="text-sm font-semibold text-white">Гонка недели</h3>
          </div>
          {totalParticipants > 0 && (
            <span className="text-xs text-white/40">{totalParticipants} участников</span>
          )}
        </div>

        {/* Позиция текущего пользователя */}
        {currentUserRank && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-white/40">Твоя позиция:</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-bold",
                currentUserRank <= 3
                  ? "bg-accent-green/20 text-accent-green"
                  : currentUserRank <= 10
                    ? "bg-accent-blue/20 text-accent-blue"
                    : "bg-white/10 text-white/60"
              )}
            >
              #{currentUserRank}
            </span>
          </div>
        )}
      </div>

      {/* Список лидеров */}
      <div className="px-4 pb-4">
        {hasParticipants ? (
          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <LeaderboardRow key={entry.userId} entry={entry} index={index} />
            ))}

            {/* Разделитель если текущий пользователь не в топе */}
            {currentUserEntry && !leaderboard.some((e) => e.isCurrentUser) && (
              <>
                <div className="flex items-center gap-2 py-1">
                  <div className="flex-1 h-[1px] bg-white/10" />
                  <span className="text-2xs text-white/20">···</span>
                  <div className="flex-1 h-[1px] bg-white/10" />
                </div>
                <LeaderboardRow
                  entry={currentUserEntry}
                  index={currentUserEntry.rank - 1}
                  highlight
                />
              </>
            )}
          </div>
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

function LeaderboardRow({
  entry,
  index,
  highlight,
}: {
  entry: LeaderboardEntry;
  index: number;
  highlight?: boolean;
}) {
  const medal = RANK_MEDALS[entry.rank];
  const isTopThree = entry.rank <= 3;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "flex items-center gap-3 p-2 rounded-xl transition-colors",
        isTopThree && medal
          ? `bg-gradient-to-r ${medal.color} border border-white/20`
          : entry.isCurrentUser || highlight
            ? "bg-accent-blue/15 border border-accent-blue/25"
            : "bg-white/[0.03] hover:bg-white/[0.06]"
      )}
    >
      {/* Ранг */}
      <div
        className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold",
          isTopThree ? "bg-transparent" : "bg-white/10 text-white/60"
        )}
      >
        {medal ? medal.emoji : entry.rank}
      </div>

      {/* Имя */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium truncate",
            entry.isCurrentUser ? "text-accent-blue" : "text-white"
          )}
        >
          {entry.name}
          {entry.isCurrentUser && <span className="text-xs text-accent-blue/60 ml-1">(вы)</span>}
        </p>
        {entry.telegramUsername && !entry.isCurrentUser && (
          <p className="text-2xs text-white/20 truncate">@{entry.telegramUsername}</p>
        )}
      </div>

      {/* Статистика */}
      <div className="text-center">
        <p className="text-sm font-bold text-white">{entry.ordersCount}</p>
        <p className="text-2xs text-white/40">
          {entry.ordersCount === 1 ? "заказ" : entry.ordersCount < 5 ? "заказа" : "заказов"}
        </p>
      </div>
    </motion.div>
  );
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
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-white/10 rounded" />
          <div className="h-4 w-24 bg-white/10 rounded" />
        </div>
        <div className="mt-2 h-5 w-32 bg-white/10 rounded" />
      </div>
      <div className="px-4 pb-4 space-y-2">
        {[...Array(5)].map((_, i) => (
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
  );
}
