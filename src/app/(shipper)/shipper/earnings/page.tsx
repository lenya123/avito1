"use client";

import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { Button, Spinner, Toggle } from "@/components/ui";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import { useShipperStats } from "@/hooks/use-shipper-stats";
import { useShipperPayouts } from "@/hooks/use-shipper-payouts";
import PendulumBar from "@/components/shipper/pendulum-bar";
import WorkDaysPicker from "@/components/shipper/work-days-picker";
import { Z_HEADER } from "@/components/shipper/constants";

// ─── Types ──────────────────────────────────────────────────────────

interface DailyEntry {
  date: string;
  orders: number;
  earnings: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Get Moscow "now" parts to avoid browser-timezone drift */
function moscowNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((acc, p) => ({ ...acc, [p.type]: Number(p.value) }), {} as Record<string, number>);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function getNextPayoutDate(): string {
  const { year, month, day } = moscowNow();
  const next = day < 15 ? new Date(year, month - 1, 15) : new Date(year, month, 1);
  return next.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow",
  });
}

function daysUntilPayout(): number {
  const { year, month, day } = moscowNow();
  if (day < 15) return 15 - day;
  const lastDay = new Date(year, month, 0).getDate();
  return lastDay - day + 1;
}

function getCurrentMonthName(): string {
  return new Date().toLocaleDateString("ru-RU", { month: "long", timeZone: "Europe/Moscow" });
}

// ─── Mini Bar Chart ─────────────────────────────────────────────────

const EarningsChart = memo(function EarningsChart({ data }: { data: DailyEntry[] }) {
  const maxEarnings = useMemo(() => Math.max(...data.map((d) => d.earnings), 1), [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-white/30 text-sm">
        Нет данных за этот месяц
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((entry, i) => {
        const heightPercent = (entry.earnings / maxEarnings) * 100;
        return (
          <motion.div
            key={entry.date}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.3 + i * 0.03, duration: 0.4, ease: "easeOut" }}
            className="flex-1 flex flex-col items-center justify-end origin-bottom group"
          >
            <div className="relative w-full flex justify-center mb-1">
              <div className="absolute -top-6 opacity-0 group-hover:opacity-100 transition-opacity text-2xs text-white/60 whitespace-nowrap">
                {entry.earnings > 0 ? formatPrice(entry.earnings) : "—"}
              </div>
            </div>
            <div
              className={cn(
                "w-full rounded-t-sm min-h-[2px] transition-colors",
                entry.earnings > 0
                  ? "bg-gradient-to-t from-accent-green/60 to-accent-green"
                  : "bg-white/10"
              )}
              style={{ height: `${Math.max(heightPercent, 2)}%` }}
            />
            {(i === 0 || i === data.length - 1 || i % 5 === 0) && (
              <span className="text-2xs text-white/30 mt-1 truncate max-w-full">
                {new Date(entry.date + "T00:00:00").getDate()}
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
});

// ─── Page ───────────────────────────────────────────────────────────

export default function ShipperEarningsPage() {
  const { data: stats, isLoading, error, refetch } = useShipperStats();
  const { data: payouts, isLoading: payoutsLoading } = useShipperPayouts();

  // ─── Loading ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <header
          className={`sticky top-0 md:top-16 ${Z_HEADER} bg-primary backdrop-blur-xl border-b border-glass`}
        >
          <div className="max-w-4xl mx-auto px-4 py-3">
            <h1 className="text-xl font-bold text-white">Деньги</h1>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-center min-h-[50vh]">
          <Spinner size="lg" />
        </main>
      </div>
    );
  }

  const paymentMode = stats?.paymentMode ?? "dynamic";
  const isFixed = paymentMode === "fixed";
  const monthEarnings = stats?.month.earnings || 0;
  const monthOrders = stats?.month.orders || 0;
  const monthReturns = stats?.month.returns || 0;
  const todayEarnings = stats?.today.earnings || 0;
  const todayOrders = stats?.today.orders || 0;
  const allTimeEarnings = stats?.allTime.earnings || 0;
  const allTimeOrders = stats?.allTime.orders || 0;
  const dailyHistory = stats?.dailyHistory || [];
  const pendingPayout = stats?.pendingPayout ?? monthEarnings;
  const pendulum = stats?.pendulum;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header
        className={`sticky top-0 md:top-16 ${Z_HEADER} bg-primary backdrop-blur-xl border-b border-glass`}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Деньги</h1>
          <Toggle checked={!isFixed} disabled size="sm" label={isFixed ? "Фикс" : "Динамическая"} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5 pb-32">
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "text-center py-12 rounded-2xl",
              "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
              "border border-glass"
            )}
          >
            <div className="text-4xl mb-3">😔</div>
            <p className="text-white/60 mb-4">Ошибка загрузки</p>
            <Button variant="secondary" onClick={() => refetch()}>
              Повторить
            </Button>
          </motion.div>
        ) : (
          <>
            {/* ─── Hero: К выплате ─────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className={cn(
                "relative overflow-hidden rounded-3xl p-6",
                "bg-gradient-to-br from-accent-green/15 via-accent-green/8 to-transparent",
                "border border-accent-green/20",
                "shadow-[0_8px_32px_rgba(48,209,88,0.12),inset_0_1px_0_rgba(255,255,255,0.1)]"
              )}
            >
              {/* Декоративный блик */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent-green/30 to-transparent" />
              {/* Glow */}
              <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-accent-green/10 blur-3xl" />

              <div className="relative">
                <p className="text-sm text-white/50 mb-1">К выплате</p>
                <p
                  className="text-4xl font-bold text-accent-green tracking-tight"
                  style={{ textShadow: "0 0 24px rgba(48,209,88,0.4)" }}
                >
                  {formatPrice(pendingPayout)}
                </p>

                <div className="flex items-center gap-3 mt-4">
                  <div className="flex items-center gap-1.5 text-sm text-white/50">
                    <svg
                      className="w-4 h-4 text-white/40"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    {getNextPayoutDate()}
                  </div>
                  <div className="w-px h-3 bg-white/15" />
                  <span className="text-sm text-white/40">через {daysUntilPayout()} д.</span>
                </div>
              </div>
            </motion.div>

            {/* ─── Маятник (только dynamic) ─────────────────── */}
            {!isFixed && pendulum && <PendulumBar data={pendulum} />}

            {/* ─── Рабочие дни ─────────────────────────────────── */}
            {!isFixed && <WorkDaysPicker />}

            {/* ─── Сегодня (только fixed — упрощённый блок) ──── */}
            {isFixed && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className={cn(
                  "rounded-2xl p-4",
                  "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
                  "border border-glass",
                  "shadow-[0_4px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]"
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white/50">Сегодня</h3>
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      "bg-accent-blue/15 text-accent-blue border border-accent-blue/20"
                    )}
                  >
                    {formatPrice(stats?.shipperRate || 0)} / заказ
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center flex-1">
                    <p className="text-xl font-bold text-white">{todayOrders}</p>
                    <p className="text-2xs text-white/40">отправок</p>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="text-center flex-1">
                    <p className="text-xl font-bold text-accent-green">
                      {formatPrice(todayEarnings)}
                    </p>
                    <p className="text-2xs text-white/40">заработано</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─── Детали месяца ───────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className={cn(
                "rounded-2xl p-4",
                "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
                "border border-glass",
                "shadow-[0_4px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]"
              )}
            >
              <h3 className="text-sm font-medium text-white/50 mb-4 capitalize">
                {getCurrentMonthName()}
              </h3>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-1.5",
                      "bg-gradient-to-br from-accent-blue/20 to-accent-blue/10",
                      "border border-accent-blue/25",
                      "shadow-[0_0_12px_rgba(10,132,255,0.15)]"
                    )}
                  >
                    <svg
                      className="w-4 h-4 text-accent-blue"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <p className="text-xl font-bold text-white">{monthOrders}</p>
                  <p className="text-2xs text-white/40">отправлено</p>
                </div>

                <div className="text-center">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-1.5",
                      "bg-gradient-to-br from-accent-orange/20 to-accent-orange/10",
                      "border border-accent-orange/25",
                      "shadow-[0_0_12px_rgba(255,159,10,0.15)]"
                    )}
                  >
                    <svg
                      className="w-4 h-4 text-accent-orange"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                      />
                    </svg>
                  </div>
                  <p className="text-xl font-bold text-white">{monthReturns}</p>
                  <p className="text-2xs text-white/40">возвратов</p>
                </div>

                <div className="text-center">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-1.5",
                      "bg-gradient-to-br from-accent-green/20 to-accent-green/10",
                      "border border-accent-green/25",
                      "shadow-[0_0_12px_rgba(48,209,88,0.15)]"
                    )}
                  >
                    <svg
                      className="w-4 h-4 text-accent-green"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <p className="text-xl font-bold text-accent-green">
                    {formatPrice(monthEarnings)}
                  </p>
                  <p className="text-2xs text-white/40">заработано</p>
                </div>
              </div>

              {/* Daily chart */}
              <div className="pt-3 border-t border-white/8">
                <p className="text-xs text-white/30 mb-3">Заработок по дням</p>
                <EarningsChart data={dailyHistory} />
              </div>
            </motion.div>

            {/* ─── За всё время ────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className={cn(
                "rounded-2xl p-4",
                "bg-gradient-to-b from-white/[0.06] to-white/[0.03]",
                "border border-glass",
                "shadow-[0_4px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)]"
              )}
            >
              <h3 className="text-sm font-medium text-white/40 mb-3">За всё время</h3>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-lg font-bold text-white">{allTimeOrders}</p>
                    <p className="text-2xs text-white/40">отправок</p>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div>
                    <p className="text-lg font-bold text-accent-green">
                      {formatPrice(allTimeEarnings)}
                    </p>
                    <p className="text-2xs text-white/40">заработано</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* ─── История выплат ──────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className={cn(
                "rounded-2xl p-4",
                "bg-gradient-to-b from-white/[0.06] to-white/[0.03]",
                "border border-glass",
                "shadow-[0_4px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)]"
              )}
            >
              <h3 className="text-sm font-medium text-white/40 mb-3">История выплат</h3>

              {payoutsLoading ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : !payouts || payouts.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs text-white/25">Появится после первой выплаты</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {payouts.map((payout, i) => (
                    <motion.div
                      key={payout.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i }}
                      className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0"
                    >
                      <div>
                        <p className="text-sm text-white/70">
                          {new Date(payout.created_at).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                        {payout.note && (
                          <p className="text-xs text-white/30 mt-0.5">{payout.note}</p>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-accent-green">
                        {formatPrice(payout.amount)}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </main>
    </div>
  );
}
