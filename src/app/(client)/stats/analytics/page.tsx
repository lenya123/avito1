"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useAnalytics, type AnalyticsPeriod } from "@/hooks/use-analytics";
import { cn } from "@/utils/cn";
import { Button, Empty, DatePicker } from "@/components/ui";
import { FinancialHero, FinancialHeroSkeleton } from "@/components/client/analytics/financial-hero";
import { HealthScore, HealthScoreSkeleton } from "@/components/client/analytics/health-score";
import { InsightCard } from "@/components/client/analytics/insight-card";
import { MetricsGrid, MetricsGridSkeleton } from "@/components/client/analytics/metrics-grid";
import {
  InvestmentPlanner,
  InvestmentPlannerSkeleton,
} from "@/components/client/analytics/investment-planner";
import { CashFlow, CashFlowSkeleton } from "@/components/client/analytics/cash-flow";
import { ProductTable, ProductTableSkeleton } from "@/components/client/analytics/product-table";
import { MoneyCycle, MoneyCycleSkeleton } from "@/components/client/analytics/money-cycle";
import { ProgressBlock, ProgressBlockSkeleton } from "@/components/client/analytics/progress-block";
import { ReferralStats } from "@/components/client/analytics/referral-stats";

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "all", label: "Всё время" },
  { value: "custom", label: "Свой период" },
];

// dd.mm.yyyy → yyyy-mm-dd for API
function toApiDate(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split(".");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// dd.mm.yyyy → Date (for minDate prop)
function toDate(ddmmyyyy: string): Date | undefined {
  const parts = ddmmyyyy.split(".");
  if (parts.length !== 3) return undefined;
  return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const isPremium = useMemo(
    () =>
      user?.isVibePlus ||
      user?.subscriptionTier === "premium" ||
      user?.subscriptionTier === "top_floor_boss",
    [user]
  );

  const dateFromParam = dateFrom ? toApiDate(dateFrom) : undefined;
  const dateToParam = dateTo ? toApiDate(dateTo) : undefined;

  const customEnabled = period !== "custom" || !!dateFrom;

  const { data, isLoading, error, refetch } = useAnalytics(
    period,
    isPremium && customEnabled,
    dateFromParam,
    dateToParam
  );

  // Insights: always rule-based from analytics API
  const insights = data?.insights ?? [];

  // Non-premium redirect
  if (!isPremium && user) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-6 rounded-2xl overflow-hidden relative",
            "bg-gradient-to-br from-accent-blue/15 to-accent-blue/8",
            "border border-accent-blue/20"
          )}
        >
          <div className="text-center">
            <span className="text-4xl mb-3 block">📊</span>
            <h2 className="text-lg font-bold text-white mb-2">Аналитика доступна в Premium</h2>
            <p className="text-sm text-white/60 mb-4">
              Health Score, инсайты, воронка заказов и многое другое
            </p>
            <Button onClick={() => router.push("/profile")}>Подключить Premium</Button>
          </div>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-5"
      >
        <button
          onClick={() => router.back()}
          className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center",
            "bg-gradient-to-b from-white/[0.1] to-white/[0.05]",
            "border border-glass-subtle",
            "hover:border-glass transition-all"
          )}
        >
          <svg
            className="w-5 h-5 text-white/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-white">Аналитика</h1>
      </motion.div>

      {/* Period tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-6"
      >
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "px-2.5 py-1.5 text-sm font-medium rounded-xl whitespace-nowrap",
                "backdrop-blur-xl border transition-all duration-200",
                period === p.value
                  ? [
                      "bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08]",
                      "text-white border-glass-strong",
                      "shadow-[0_4px_16px_rgba(0,0,0,0.3),0_0_20px_rgba(94,92,230,0.15),inset_0_1px_0_rgba(255,255,255,0.2)]",
                    ]
                  : [
                      "bg-white/[0.06] text-white/60 border-glass-subtle",
                      "shadow-glass-inset",
                      "hover:text-white hover:bg-white/[0.10] hover:border-white/20",
                    ]
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date pickers */}
        {period === "custom" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex gap-3 mt-3"
          >
            <div className="flex-1">
              <DatePicker label="От" value={dateFrom} onChange={setDateFrom} placeholder="Начало" />
            </div>
            <div className="flex-1">
              <DatePicker
                label="До"
                value={dateTo}
                onChange={setDateTo}
                placeholder="Конец"
                minDate={toDate(dateFrom)}
              />
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Error state */}
      {error && !isLoading && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Empty
            icon="😔"
            title="Ошибка загрузки"
            description="Не удалось загрузить аналитику"
            action={
              <Button variant="secondary" onClick={() => refetch()}>
                Повторить
              </Button>
            }
          />
        </motion.div>
      )}

      {/* 1. Financial Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {isLoading ? (
          <FinancialHeroSkeleton />
        ) : data ? (
          <FinancialHero financial={data.financial} hideTrend={period === "all"} />
        ) : null}
      </motion.div>

      {/* 2. Health Score */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6"
      >
        {isLoading ? (
          <HealthScoreSkeleton />
        ) : data ? (
          <HealthScore
            {...data.healthScore}
            trend={period === "all" ? 0 : data.healthScore.trend}
          />
        ) : null}
      </motion.div>

      {/* 3. Metrics + Funnel */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mt-6"
      >
        {isLoading ? (
          <MetricsGridSkeleton />
        ) : data ? (
          <MetricsGrid
            metrics={data.metrics}
            funnel={data.funnel}
            totalOrders={data.funnel.created}
            ordersPerDay={data.ordersPerDay}
            trends={period !== "all" ? data.trends : undefined}
            showTrendsHint={period === "all"}
          />
        ) : null}
      </motion.div>

      {/* 4. Cash Flow */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-6"
      >
        {isLoading ? (
          <CashFlowSkeleton />
        ) : data ? (
          <CashFlow
            deposit={data.deposit}
            referralDeposit={data.referralDeposit}
            activeOrdersCount={data.financial.activeOrdersCount}
            activeInvested={data.financial.activeInvested}
            avgRemainingDays={data.moneyCycle.avgRemainingDays}
            pendingShipmentCount={data.moneyCycle.pendingShipmentCount}
            pendingShipmentInvested={data.moneyCycle.pendingShipmentInvested}
            avgOrderPrice={data.avgOrderPrice}
          />
        ) : null}
      </motion.div>

      {/* 5. Insights */}
      {insights.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-6"
        >
          <h2 className="text-lg font-semibold text-white mb-3">Инсайты</h2>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <InsightCard key={i} {...insight} index={i} />
            ))}
          </div>
        </motion.div>
      )}

      {/* 6. Products */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-6"
      >
        {isLoading ? (
          <ProductTableSkeleton />
        ) : data ? (
          <ProductTable products={data.products} />
        ) : null}
      </motion.div>

      {/* 7. Investment Planner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="mt-6"
      >
        {isLoading ? (
          <InvestmentPlannerSkeleton />
        ) : data ? (
          <InvestmentPlanner
            avgOrderPrice={data.planner.completedAvgPrice}
            avgProfitPerOrder={data.planner.avgProfitPerOrder}
            avgCycleDays={data.planner.avgCycleDays}
            products={data.products}
            ordersPerDay={data.planner.ordersPerDay}
            completedOrders={data.planner.completedOrders}
            conversionRate={data.planner.conversionRate}
          />
        ) : null}
      </motion.div>

      {/* 8. Money Cycle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-6"
      >
        {isLoading ? (
          <MoneyCycleSkeleton />
        ) : data ? (
          <MoneyCycle moneyCycle={data.moneyCycle} delivery={data.delivery} />
        ) : null}
      </motion.div>

      {/* 9. Progress */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="mt-6"
      >
        {isLoading ? (
          <ProgressBlockSkeleton />
        ) : data ? (
          <ProgressBlock progress={data.progress} />
        ) : null}
      </motion.div>

      {/* 10. Referrals */}
      {data && data.referralCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-6 mb-8"
        >
          <ReferralStats
            referralCount={data.referralCount}
            referralEarned={data.referralEarned}
            activeReferrals={data.activeReferrals}
          />
        </motion.div>
      )}
    </main>
  );
}
