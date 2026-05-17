"use client";

import Image from "next/image";
import { cn } from "@/utils/cn";

export interface ProfileCardProps {
  name: string;
  telegramUsername?: string | null;
  level: number;
  discountPercent: number;
  isVibePlus: boolean;
  completedOrders: number;
  avatarUrl?: string | null;
  className?: string;
}

const LEVEL_NAMES = ["Новичок", "Продавец", "Профи", "Эксперт"];
// Прогрессия от белого к accent blue (#0A84FF)
const LEVEL_COLORS = [
  "text-white", // #FFFFFF
  "text-level-1", // светло-голубой
  "text-level-2", // средний синий
  "text-accent-blue", // #0A84FF
];
// Прогрессия градиента фона: от белого к синему (совпадает с текстом)
// Opacity выше для светлых цветов чтобы компенсировать низкую насыщенность
const LEVEL_GRADIENTS = [
  "rgba(255,255,255,0.12)", // белый
  "color-mix(in srgb, var(--level-1-color) 14%, transparent)", // level-1
  "color-mix(in srgb, var(--level-2-color) 16%, transparent)", // level-2
  "rgba(10,132,255,0.18)", // #0A84FF
];

export function ProfileCard({
  name,
  telegramUsername,
  level,
  discountPercent,
  isVibePlus,
  completedOrders,
  avatarUrl,
  className,
}: ProfileCardProps) {
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
      {/* Градиент зависит от уровня — чем выше, тем ярче */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom right, ${LEVEL_GRADIENTS[level]} 0%, transparent 70%)`,
        }}
      />
      {/* Декоративный блик */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Avatar and Name */}
      <div className="flex items-center gap-4 relative">
        <div
          className={cn(
            "relative w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white/80",
            "bg-gradient-to-b from-white/[0.15] to-white/[0.08]",
            "border border-glass-active",
            "shadow-card",
            "overflow-hidden"
          )}
        >
          {/* Блик сверху */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent z-10" />
          {avatarUrl ? (
            <Image src={avatarUrl} alt={name} fill className="object-cover" sizes="64px" />
          ) : (
            name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">{name}</h2>
          {telegramUsername && <p className="text-sm text-white/60 mt-0.5">@{telegramUsername}</p>}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { value: level, label: "Уровень", color: LEVEL_COLORS[level] },
          { value: `${discountPercent}%`, label: "Скидка", color: "text-white" },
          { value: completedOrders, label: "Заказов", color: "text-white" },
        ].map((stat, i) => (
          <div
            key={i}
            className={cn(
              "text-center p-3 rounded-xl",
              "bg-gradient-to-br from-white/[0.08] to-white/[0.03]",
              "border border-glass-subtle"
            )}
          >
            <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
            <p className="text-xs text-white/40 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Level Badge */}
      <div className="mt-4 pt-4 border-t border-glass-subtle">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/60">Статус</span>
          <span
            className={cn(
              "text-sm font-medium px-2.5 py-1 rounded-xl",
              "bg-gradient-to-br from-white/[0.1] to-white/[0.05]",
              "border border-glass-subtle",
              isVibePlus ? "text-accent-green" : LEVEL_COLORS[level]
            )}
          >
            {isVibePlus ? "+ВАЙБ" : LEVEL_NAMES[level]}
          </span>
        </div>
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
