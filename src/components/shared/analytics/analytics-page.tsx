"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  PERIOD_OPTIONS,
  GRANULARITY_OPTIONS,
  type OwnerAnalyticsFilters,
} from "@/hooks/use-owner-analytics";
import { useRoleAnalytics } from "@/hooks/use-role-analytics";
import { ErrorState, DatePicker } from "@/components/ui";
import {
  FinancialHero,
  FinancialHeroSkeleton,
  TrendChart,
  TrendChartSkeleton,
  OrderFunnel,
  OrderFunnelSkeleton,
  ProductMatrix,
  ProductMatrixSkeleton,
  ClientAnalytics,
  ClientAnalyticsSkeleton,
  DayHeatmap,
} from "@/components/shared/analytics";
import {
  OwnerInsights,
  OwnerInsightsSkeleton,
  StrategySection,
  StrategySectionSkeleton,
  FinanceSummaryCard,
  FinanceSummaryCardSkeleton,
} from "@/components/owner/analytics";
import { ChannelToggle, type Channel } from "@/components/owner/analytics/channel-toggle";
import { ChannelsCard } from "@/components/owner/analytics/channels-card";
import { cn } from "@/utils/cn";
import type { Role } from "@/lib/roles/role-config";

function toApiDate(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split(".");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function toDate(ddmmyyyy: string): Date | undefined {
  const parts = ddmmyyyy.split(".");
  if (parts.length !== 3) return undefined;
  return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
}

interface Props {
  role: Role;
}

export function AnalyticsPage({ role }: Props) {
  const [filters, setFilters] = useState<OwnerAnalyticsFilters>({ period: "month" });
  const [showComparison, setShowComparison] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [channel, setChannel] = useState<Channel>("all");

  const actualFilters = useMemo<OwnerAnalyticsFilters>(() => {
    const f: OwnerAnalyticsFilters = { ...filters };
    if (filters.period === "custom") {
      if (dateFrom) f.dateFrom = toApiDate(dateFrom);
      if (dateTo) f.dateTo = toApiDate(dateTo);
    }
    if (showComparison) f.compare = true;
    if (channel !== "all") f.channel = channel;
    return f;
  }, [filters, showComparison, dateFrom, dateTo, channel]);

  const { data, isLoading, error, refetch } = useRoleAnalytics(role, actualFilters);

  const showGranularity =
    filters.period === "quarter" || filters.period === "year" || filters.period === "custom";
  const showInsightsAndStrategy = role === "owner";

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить аналитику"
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Аналитика</h1>
            <p className="text-white/60 mt-1">Детальная статистика бизнеса</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilters({ ...filters, period: option.value })}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-xl border transition-all duration-200",
                  "backdrop-blur-xl",
                  filters.period === option.value
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
                {option.label}
              </button>
            ))}

            {/* ТЗ §7.1: канал сбыта (фильтрует все KPI/графики/таблицы,
                кроме карточки «Каналы сбыта» ниже — она всегда показывает обе). */}
            <ChannelToggle value={channel} onChange={setChannel} />

            <button
              onClick={() => setShowComparison(!showComparison)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-xl border transition-colors duration-200",
                showComparison
                  ? "bg-accent-blue/20 border-accent-blue/20 text-accent-blue"
                  : "border-glass text-white/40 hover:text-white/60"
              )}
            >
              Сравнить
            </button>
          </div>
        </div>

        {filters.period === "custom" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex gap-3 max-w-sm"
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

        {showGranularity && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40">Детализация:</span>
            {GRANULARITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilters({ ...filters, granularity: option.value })}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-lg border transition-colors duration-200",
                  filters.granularity === option.value
                    ? "bg-white/[0.12] border-glass-active text-white"
                    : "border-glass text-white/40 hover:text-white/60"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {data && (
          <p className="text-sm text-white/60">
            {new Date(data.period.from).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
            })}{" "}
            —{" "}
            {new Date(data.period.to).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
      </motion.div>

      {/* Financial Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.05 }}
      >
        {isLoading ? (
          <FinancialHeroSkeleton />
        ) : data ? (
          <FinancialHero
            profit={data.financial.profit}
            profitChange={data.financial.profitChange}
            revenue={data.financial.revenue}
            cost={data.financial.cost}
            roiPercent={data.financial.roiPercent}
            aov={data.financial.aov}
            clientDepositPool={data.operational.clientDepositPool}
            revenueChange={data.financial.revenueChange}
            costChange={data.financial.costChange}
            aovChange={data.financial.aovChange}
            roiChange={data.financial.roiChange}
          />
        ) : null}
      </motion.div>

      {/* Trend Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.1 }}
      >
        {isLoading ? (
          <TrendChartSkeleton />
        ) : data ? (
          <TrendChart data={data.chart} comparisonData={data.comparisonChart} />
        ) : null}
      </motion.div>

      {/* Finance Summary Card — мост к странице Финансы (owner only).
          Apple-стиль: hero-сводка → drill-down в журналы и Кассу. */}
      {role === "owner" &&
        (isLoading ? (
          <FinanceSummaryCardSkeleton />
        ) : data?.financeSummary ? (
          <FinanceSummaryCard
            netProfit={data.financeSummary.netProfit}
            totalExpenses={data.financeSummary.totalExpenses}
            expensesCount={data.financeSummary.expensesCount}
            totalPayouts={data.financeSummary.totalPayouts}
            payoutsCount={data.financeSummary.payoutsCount}
            treasury={data.financeSummary.treasury}
          />
        ) : null)}

      {/* ТЗ §7.2: «Каналы сбыта» — всегда видна, фильтр канала на неё
          не действует. Между TrendChart и DayHeatmap. */}
      {role === "owner" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
          <ChannelsCard
            period={filters.period}
            dateFrom={actualFilters.dateFrom}
            dateTo={actualFilters.dateTo}
          />
        </motion.div>
      )}

      {/* Day Heatmap */}
      {!isLoading && data?.ordersByDayOfWeek && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.15 }}
        >
          <DayHeatmap data={data.ordersByDayOfWeek} />
        </motion.div>
      )}

      {/* Funnel + (Owner only) Insights */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.18 }}
        className={cn(
          "grid grid-cols-1 gap-6",
          showInsightsAndStrategy && data && data.insights.length > 0 && "lg:grid-cols-2"
        )}
      >
        {isLoading ? (
          <>
            <OrderFunnelSkeleton />
            {showInsightsAndStrategy && <OwnerInsightsSkeleton />}
          </>
        ) : data ? (
          <>
            <OrderFunnel funnel={data.funnel} />
            {showInsightsAndStrategy && data.insights.length > 0 && (
              <OwnerInsights insights={data.insights} />
            )}
          </>
        ) : null}
      </motion.div>

      {/* Product Matrix */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.22 }}
      >
        {isLoading ? (
          <ProductMatrixSkeleton />
        ) : data ? (
          <ProductMatrix products={data.productMatrix} categories={data.categories} />
        ) : null}
      </motion.div>

      {/* Clients */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.26 }}
      >
        {isLoading ? (
          <ClientAnalyticsSkeleton />
        ) : data ? (
          <ClientAnalytics stats={data.clientStats} topClients={data.topClients} />
        ) : null}
      </motion.div>

      {/* Strategy (Owner only) */}
      {showInsightsAndStrategy && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          {isLoading ? (
            <StrategySectionSkeleton />
          ) : data ? (
            <StrategySection
              healthScore={data.healthScore}
              operational={data.operational}
              forecast={data.forecast}
            />
          ) : null}
        </motion.div>
      )}
    </div>
  );
}
