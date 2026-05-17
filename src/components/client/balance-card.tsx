"use client";

import { cn } from "@/utils/cn";
import { Button } from "@/components/ui";
import { formatPrice } from "@/utils/pricing";

export interface BalanceCardProps {
  deposit: number;
  referralDeposit: number;
  isVibePlus: boolean;
  depositLimit?: number;
  onTopUp?: () => void;
  className?: string;
}

export function BalanceCard({
  deposit,
  referralDeposit,
  isVibePlus,
  depositLimit = 100000,
  onTopUp,
  className,
}: BalanceCardProps) {
  const totalBalance = deposit + referralDeposit;
  const isNegative = deposit < 0;

  // Для +ВАЙБ показываем доступный лимит
  const availableVibe = isVibePlus ? depositLimit + deposit : 0;

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

      <div className="flex items-center justify-between mb-4 relative">
        <h3 className="text-lg font-bold text-white">Баланс</h3>
        {onTopUp && (
          <Button size="sm" onClick={onTopUp}>
            Пополнить
          </Button>
        )}
      </div>

      {/* Total Balance */}
      <div
        className={cn(
          "mb-4 p-4 rounded-xl",
          "bg-gradient-to-br from-white/[0.08] to-white/[0.03]",
          "border border-glass-subtle"
        )}
      >
        <p className="text-sm text-white/60 mb-1">Общий баланс</p>
        <p className={cn("text-3xl font-bold", isNegative ? "text-accent-red" : "text-white")}>
          {formatPrice(totalBalance)}
        </p>
      </div>

      {/* Breakdown */}
      <div className="space-y-3 pt-4 border-t border-glass-subtle">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/60">Основной депозит</span>
          <span
            className={cn(
              "text-sm font-medium px-2 py-0.5 rounded-md",
              deposit < 0 ? "bg-accent-red/20 text-accent-red" : "text-white"
            )}
          >
            {formatPrice(deposit)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/60">Реферальный бонус</span>
          <span className="text-sm font-medium text-accent-green">
            {formatPrice(referralDeposit)}
          </span>
        </div>
        {isVibePlus && (
          <>
            <div className="h-px bg-glass-subtle" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Лимит +ВАЙБ</span>
              <span className="text-sm font-medium text-white">{formatPrice(depositLimit)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Доступно для заказа</span>
              <span
                className={cn(
                  "text-sm font-medium px-2 py-0.5 rounded-md",
                  "bg-white/15 text-white"
                )}
              >
                {formatPrice(availableVibe)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Warning only for +ВАЙБ when limit is exceeded */}
      {/* Обычные клиенты не могут уходить в минус — система не позволяет */}
      {isVibePlus && deposit < -depositLimit && (
        <div
          className={cn(
            "mt-4 p-4 rounded-xl",
            "bg-gradient-to-br from-accent-red/15 to-accent-red/5",
            "border border-accent-red/30"
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                "bg-accent-red/20"
              )}
            >
              <span className="text-lg">⚠️</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-accent-red">Лимит исчерпан</p>
              <p className="text-xs text-white/60 mt-0.5">
                Пополните баланс для продолжения заказов
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Skeleton
export function BalanceCardSkeleton() {
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
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-20 bg-white/10 rounded" />
        <div className="h-8 w-24 bg-white/10 rounded-lg" />
      </div>
      <div className="mb-4 p-4 rounded-xl bg-white/[0.05] border border-glass-subtle">
        <div className="h-4 w-24 bg-white/10 rounded mb-2" />
        <div className="h-10 w-40 bg-white/10 rounded" />
      </div>
      <div className="space-y-3 pt-4 border-t border-glass-subtle">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="h-4 w-32 bg-white/10 rounded" />
            <div className="h-4 w-20 bg-white/10 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
