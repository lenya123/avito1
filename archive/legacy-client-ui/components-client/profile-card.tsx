"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/utils/cn";
import { LEVELS, LEVEL_COLORS } from "@/lib/constants/levels";

export interface ProfileCardProps {
  name: string;
  telegramUsername?: string | null;
  level: number;
  discountPercent: number;
  isVibePlus: boolean;
  completedOrders: number;
  avatarUrl?: string | null;
  currentRank?: number | null;
  className?: string;
}

export function ProfileCard({
  name,
  telegramUsername,
  level,
  discountPercent,
  isVibePlus,
  completedOrders,
  avatarUrl,
  currentRank,
  className,
}: ProfileCardProps) {
  const effectiveLevel = isVibePlus ? 3 : level;
  const colors = LEVEL_COLORS[effectiveLevel];
  const levelConfig = LEVELS[effectiveLevel];

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
      {/* Level gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom right, ${colors.bgGradient.split(",")[0]}) 0%, transparent 70%)`,
        }}
      />
      {/* Decorative highlight */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Avatar and Name */}
      <div className="flex items-center gap-4 relative">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div
            className={cn(
              "relative w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white/80",
              "bg-gradient-to-b from-white/[0.15] to-white/[0.08]",
              "border border-glass-active",
              "shadow-card",
              "overflow-hidden"
            )}
          >
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent z-10" />
            {avatarUrl ? (
              <Image src={avatarUrl} alt={name} fill className="object-cover" sizes="64px" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </div>
        </div>

        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">{name}</h2>
          {/* Status line */}
          <p className="text-sm text-white/40 mt-0.5">
            {currentRank
              ? `Участвует в гонке · #${currentRank}`
              : telegramUsername
                ? `@${telegramUsername}`
                : `${completedOrders} заказов`}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          {
            value: levelConfig.emoji,
            label: `Уровень:\n${levelConfig.name}`,
            color: colors.text,
          },
          {
            value: `${discountPercent}%`,
            label: "Скидка подписки",
            color: "text-white",
          },
          { value: completedOrders, label: "Успешных\nзаказов", color: "text-white" },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
            className={cn(
              "text-center p-3 rounded-xl",
              "bg-gradient-to-br from-white/[0.08] to-white/[0.03]",
              "border border-glass-subtle"
            )}
          >
            <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
            <p className="text-xs text-white/40 mt-1 whitespace-pre-line">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Skeleton
export function ProfileCardSkeleton() {
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
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-white/10" />
        <div className="flex-1">
          <div className="h-6 w-32 bg-white/10 rounded mb-2" />
          <div className="h-4 w-24 bg-white/10 rounded" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3 rounded-xl bg-white/[0.05] border border-glass-subtle">
            <div className="h-8 w-12 bg-white/10 rounded mx-auto mb-2" />
            <div className="h-3 w-16 bg-white/10 rounded mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
