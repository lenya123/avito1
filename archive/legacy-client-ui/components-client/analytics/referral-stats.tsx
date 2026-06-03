"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";

interface ReferralItem {
  id: string;
  first_order_bonus: number;
  first_order_bonus_paid: boolean;
  referral_orders_count: number;
  referral_orders_sum: number;
  percent_bonus: number;
  percent_bonus_cap: number;
  bonus_period_ends_at: string | null;
  is_active: boolean;
  created_at: string;
  referral: {
    name: string | null;
    telegram_username: string | null;
  };
}

interface ReferralStatsProps {
  referralCount: number;
  referralEarned: number;
  activeReferrals: number;
  className?: string;
}

async function fetchReferrals(): Promise<ReferralItem[]> {
  const res = await fetch("/api/referrals");
  if (!res.ok) throw new Error("Ошибка загрузки рефералов");
  const data = await res.json();
  return data.referrals ?? [];
}

function getTotalEarned(item: ReferralItem): number {
  return (
    (item.first_order_bonus_paid ? Number(item.first_order_bonus) || 500 : 0) +
    (Number(item.percent_bonus) || 0)
  );
}

export function ReferralStats({
  referralCount,
  referralEarned,
  activeReferrals,
  className,
}: ReferralStatsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: referrals } = useQuery({
    queryKey: ["referrals-analytics"],
    queryFn: fetchReferrals,
    staleTime: 60 * 1000,
    enabled: referralCount > 0,
  });

  if (referralCount === 0) return null;

  // Sort by total earned descending, take top 5
  const sorted = referrals
    ? [...referrals].sort((a, b) => getTotalEarned(b) - getTotalEarned(a)).slice(0, 5)
    : [];

  const hasMore = (referrals?.length ?? 0) > 5;

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
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Рефералы</h3>
          <span className="text-sm font-medium text-white/60 px-3 py-1 rounded-full bg-white/[0.06] border border-glass-subtle backdrop-blur-xl shadow-glass-inset">
            {referralCount}
          </span>
        </div>

        {/* Summary row */}
        <div className="flex gap-3 mb-4">
          <div
            className={cn(
              "flex-1 p-3 rounded-xl",
              "bg-gradient-to-br from-accent-green/10 to-accent-green/5",
              "border border-accent-green/20"
            )}
          >
            <p className="text-lg font-bold text-accent-green">{formatPrice(referralEarned)}</p>
            <p className="text-2xs text-white/40">заработано</p>
          </div>
          <div
            className={cn(
              "flex-1 p-3 rounded-xl",
              "bg-gradient-to-br from-white/[0.08] to-white/[0.03]",
              "border border-glass-subtle"
            )}
          >
            <p className="text-lg font-bold text-accent-blue">{activeReferrals}</p>
            <p className="text-2xs text-white/40">активных</p>
          </div>
        </div>

        {/* Referral list */}
        {sorted.length > 0 && (
          <div className="space-y-2">
            {sorted.map((item, i) => {
              const isExpanded = expandedId === item.id;
              const name =
                item.referral?.name ||
                (item.referral?.telegram_username
                  ? `@${item.referral.telegram_username}`
                  : "Реферал");
              const earned = getTotalEarned(item);
              const daysLeft = item.bonus_period_ends_at
                ? Math.max(
                    0,
                    Math.floor(
                      (new Date(item.bonus_period_ends_at).getTime() - Date.now()) / 86400000
                    )
                  )
                : 0;
              const isActive = item.is_active && daysLeft > 0;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl transition-all",
                      "bg-gradient-to-b from-white/[0.04] to-transparent",
                      "border border-glass-subtle",
                      "hover:border-glass hover:from-white/[0.06]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                      isExpanded && "border-glass from-white/[0.06]"
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                        "bg-gradient-to-br from-white/[0.08] to-white/[0.04]",
                        "border border-glass-subtle"
                      )}
                    >
                      <span className="text-lg">👤</span>
                    </div>

                    {/* Name + status */}
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm text-white truncate">{name}</p>
                      <span
                        className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-2xs font-medium mt-0.5",
                          isActive
                            ? "bg-accent-green/15 text-accent-green"
                            : "bg-white/[0.06] text-white/40"
                        )}
                      >
                        {isActive ? "Активен" : "Завершён"}
                      </span>
                    </div>

                    {/* Earned */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-accent-green">
                        +{formatPrice(earned)}
                      </p>
                    </div>

                    {/* Chevron */}
                    <svg
                      className={cn(
                        "w-4 h-4 text-white/20 transition-transform shrink-0",
                        isExpanded && "rotate-180"
                      )}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 py-3 mt-1 rounded-xl bg-gradient-to-b from-white/[0.06] to-white/[0.03] border border-glass-subtle space-y-3">
                          {/* 500₽ bonus */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/40">Бонус 500₽</span>
                            {item.first_order_bonus_paid ? (
                              <span className="text-xs font-medium text-accent-green">
                                Получено
                              </span>
                            ) : (
                              <span className="text-xs text-white/20">Нет успешных заказов</span>
                            )}
                          </div>

                          {/* 7% progress */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs text-white/40">7% бонус</span>
                              <span className="text-xs font-medium text-white/60">
                                {formatPrice(Number(item.percent_bonus) || 0)} /{" "}
                                {formatPrice(Number(item.percent_bonus_cap) || 7000)}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-accent-green/80 to-accent-green transition-all duration-300"
                                style={{
                                  width: `${Math.min(100, (Number(item.percent_bonus) / (Number(item.percent_bonus_cap) || 7000)) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>

                          {/* Orders + period */}
                          <div className="flex items-center justify-between pt-2 border-t border-glass-subtle">
                            <span className="text-xs text-white/40">
                              {item.referral_orders_count || 0} заказов
                              {item.referral_orders_sum
                                ? ` на ${formatPrice(Number(item.referral_orders_sum))}`
                                : ""}
                            </span>
                            {isActive && (
                              <span className="text-xs text-white/40">{daysLeft} дн. осталось</span>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* "All referrals" link */}
        {hasMore && (
          <a
            href="/profile"
            className={cn(
              "mt-3 flex items-center justify-center gap-1 py-2.5 rounded-xl",
              "bg-gradient-to-b from-white/[0.04] to-transparent",
              "border border-glass-subtle",
              "hover:border-glass hover:from-white/[0.06]",
              "transition-all duration-200",
              "text-sm text-white/60 hover:text-white/80"
            )}
          >
            Все рефералы
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
