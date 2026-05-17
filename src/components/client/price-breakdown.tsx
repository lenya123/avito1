"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";

export interface PriceBreakdownData {
  basePrice: number;
  firstOrderDiscount: number;
  levelDiscount: number;
  levelDiscountPercent: number;
  totalDiscount: number;
  finalPrice: number;
}

export interface PriceBreakdownProps {
  pricing: PriceBreakdownData;
  balance?: {
    deposit: number;
    referralDeposit: number;
  };
  isVibePlus?: boolean;
  vibeLimit?: number;
  className?: string;
}

export function PriceBreakdown({
  pricing,
  balance,
  isVibePlus = false,
  vibeLimit = 0,
  className,
}: PriceBreakdownProps) {
  const totalBalance = balance ? balance.deposit + balance.referralDeposit : 0;
  const canPayWithDeposit = totalBalance >= pricing.finalPrice;
  const vibeAvailable = isVibePlus ? totalBalance + vibeLimit : 0;
  const canPayWithVibe = !canPayWithDeposit && isVibePlus && vibeAvailable >= pricing.finalPrice;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Расчёт цены */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-white/80">
          <span>Базовая цена</span>
          <span className="font-medium">{formatPrice(pricing.basePrice)}</span>
        </div>

        {pricing.firstOrderDiscount > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center justify-between text-white/80"
          >
            <span className="flex items-center gap-2">
              <span className="text-lg">🎁</span>
              Скидка новичка
            </span>
            <span className="font-medium">-{formatPrice(pricing.firstOrderDiscount)}</span>
          </motion.div>
        )}

        {pricing.levelDiscount > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center justify-between text-white/80"
          >
            <span className="flex items-center gap-2">
              <span className="text-lg">⭐</span>
              Скидка по уровню ({pricing.levelDiscountPercent}%)
            </span>
            <span className="font-medium">-{formatPrice(pricing.levelDiscount)}</span>
          </motion.div>
        )}

        {pricing.totalDiscount > 0 && (
          <div className="pt-2 border-t border-glass-minimal">
            <div className="flex items-center justify-between text-white/60">
              <span>Общая скидка</span>
              <span className="font-medium text-white">-{formatPrice(pricing.totalDiscount)}</span>
            </div>
          </div>
        )}

        {/* Итого */}
        <div className="pt-3 border-t border-glass-minimal">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-white">Итого</span>
            <motion.span
              key={pricing.finalPrice}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              className="text-xl font-bold text-white"
            >
              {formatPrice(pricing.finalPrice)}
            </motion.span>
          </div>
        </div>
      </div>

      {/* Информация о балансе */}
      {balance && (
        <div className="pt-4 border-t border-glass-minimal space-y-3">
          <h4 className="text-sm font-medium text-white/60">Баланс</h4>

          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Депозит</span>
            <span
              className={cn("font-medium", balance.deposit >= 0 ? "text-white" : "text-accent-red")}
            >
              {formatPrice(balance.deposit)}
            </span>
          </div>

          {balance.referralDeposit > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">Реферальный бонус</span>
              <span className="font-medium text-white">{formatPrice(balance.referralDeposit)}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-white/80">Доступно</span>
            <span className="font-semibold text-white">{formatPrice(totalBalance)}</span>
          </div>

          {/* +ВАЙБ информация */}
          {isVibePlus && (
            <div className="pt-3 mt-3 border-t border-glass-minimal space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-white/20 text-white">
                  +ВАЙБ
                </span>
                <span className="text-sm text-white/60">Можно в долг</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Лимит долга</span>
                <span className="font-medium text-white">{formatPrice(vibeLimit)}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Доступно всего</span>
                <span className="font-medium text-white">{formatPrice(vibeAvailable)}</span>
              </div>
            </div>
          )}

          {/* Статус оплаты */}
          {canPayWithDeposit ? (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-xl bg-accent-green/10 border border-accent-green/20"
            >
              <svg
                className="w-5 h-5 text-accent-green"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-sm text-accent-green">Достаточно средств на депозите</span>
            </motion.div>
          ) : canPayWithVibe ? (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-xl bg-white/10 border border-glass"
            >
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm text-white">
                Заказ уйдёт в долг ({formatPrice(pricing.finalPrice - totalBalance)})
              </span>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-xl bg-accent-red/10 border border-accent-red/20"
            >
              <svg
                className="w-5 h-5 text-accent-red"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm text-accent-red">
                Недостаточно средств. Пополните депозит на{" "}
                {formatPrice(pricing.finalPrice - totalBalance)}
              </span>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
