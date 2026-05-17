"use client";

import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";

interface CashFlowProps {
  deposit: number;
  referralDeposit: number;
  activeOrdersCount: number;
  activeInvested: number;
  avgRemainingDays: number;
  pendingShipmentCount: number;
  pendingShipmentInvested: number;
  avgOrderPrice: number;
  className?: string;
}

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

export function CashFlow({
  deposit,
  referralDeposit,
  activeOrdersCount,
  activeInvested,
  avgRemainingDays,
  pendingShipmentCount,
  pendingShipmentInvested,
  avgOrderPrice,
  className,
}: CashFlowProps) {
  const totalBalance = deposit + referralDeposit;
  const inTransit = activeInvested;
  const total = totalBalance + inTransit;
  const canOrder = avgOrderPrice > 0 ? Math.floor(totalBalance / avgOrderPrice) : 0;
  const daysRound = Math.round(avgRemainingDays);
  const shippedCount = activeOrdersCount - pendingShipmentCount;

  if (total === 0 && activeOrdersCount === 0) return null;

  const balancePct = total > 0 ? (totalBalance / total) * 100 : 0;
  const transitPct = total > 0 ? (inTransit / total) * 100 : 0;

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

      <div className="relative p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Деньги в обороте</h3>

        {/* Proportional bar */}
        {total > 0 && (
          <div className="flex h-3 rounded-full overflow-hidden bg-white/[0.15] border border-glass-minimal mb-3">
            {totalBalance > 0 && (
              <div
                className="h-full bg-accent-green transition-all border-r-2 border-accent-green/30"
                style={{ width: `${balancePct}%` }}
              />
            )}
            {inTransit > 0 && (
              <div
                className="h-full bg-accent-blue rounded-r-full transition-all border-r-2 border-accent-blue/30"
                style={{ width: `${transitPct}%` }}
              />
            )}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-accent-green" />
            <span className="text-xs text-white/40">Баланс</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-accent-blue" />
            <span className="text-xs text-white/40">В пути</span>
          </div>
        </div>

        {/* Key numbers */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">На балансе</span>
            <span className="text-sm font-medium text-accent-green">
              {formatPrice(totalBalance)}
            </span>
          </div>

          {pendingShipmentCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Ожидают отправки</span>
              <span className="text-sm font-medium text-white/80">
                {formatPrice(pendingShipmentInvested)}
                <span className="text-xs text-white/20 ml-1">
                  ({pendingShipmentCount} {getOrdersWord(pendingShipmentCount)})
                </span>
              </span>
            </div>
          )}

          {activeOrdersCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">В пути</span>
              <span className="text-sm font-medium text-accent-blue">
                {formatPrice(inTransit)}
                <span className="text-xs text-white/20 ml-1">
                  ({activeOrdersCount} {getOrdersWord(activeOrdersCount)})
                </span>
              </span>
            </div>
          )}

          {daysRound > 0 && shippedCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Вернутся через</span>
              <span className="text-sm font-medium text-white/60">
                ~{daysRound} {getDaysWord(daysRound)}
              </span>
            </div>
          )}

          {canOrder > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-glass-subtle">
              <span className="text-xs text-white/40">Хватит на</span>
              <span className="text-sm font-medium text-white/60">
                ~{canOrder} {getOrdersWord(canOrder)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CashFlowSkeleton({ className }: { className?: string }) {
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
      <div className="p-6">
        <div className="h-5 w-36 bg-white/10 rounded mb-4" />
        <div className="h-3 w-full bg-white/[0.06] rounded-full mb-3" />
        <div className="flex gap-4 mb-4">
          <div className="h-3 w-16 bg-white/10 rounded" />
          <div className="h-3 w-12 bg-white/10 rounded" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-3 w-20 bg-white/10 rounded" />
              <div className="h-3 w-16 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
