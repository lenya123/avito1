"use client";

import { StatsCard, StatsCardSkeleton } from "@/components/client";
import { formatPrice } from "@/utils/pricing";
import { cn } from "@/utils/cn";
import type { AnalyticsResponse } from "@/hooks/use-analytics";

interface MetricsGridProps {
  metrics: AnalyticsResponse["metrics"];
  funnel: AnalyticsResponse["funnel"];
  totalOrders: number;
  ordersPerDay: number;
  trends?: AnalyticsResponse["trends"];
  showTrendsHint?: boolean;
  className?: string;
}

function getOrdersWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 19) return "заказов";
  if (lastDigit === 1) return "заказ";
  if (lastDigit >= 2 && lastDigit <= 4) return "заказа";
  return "заказов";
}

/* ── Compact funnel pipeline ── */

function FunnelPipeline({ funnel }: { funnel: AnalyticsResponse["funnel"] }) {
  const stages = [
    { label: "Создано", count: funnel.created, color: "text-white/60" },
    { label: "Отправлено", count: funnel.shipped, color: "text-accent-blue" },
    { label: "Доставлено", count: funnel.delivered, color: "text-accent-green" },
    { label: "Возвраты", count: funnel.returned, color: "text-accent-orange" },
  ];

  if (stages[0].count === 0) return null;

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden px-5 py-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Main flow */}
      <div className="flex items-center">
        {stages.map((stage, i) => (
          <div key={stage.label} className="contents">
            {i > 0 && (
              <svg
                className="w-4 h-4 text-white/20 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
            <div className="flex-1 text-center">
              <p className="text-xs text-white/40 mb-0.5">{stage.label}</p>
              <p className={cn("text-xl font-bold", stage.color)}>{stage.count}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Metrics Grid ── */

export function MetricsGrid({
  metrics,
  funnel,
  totalOrders,
  ordersPerDay,
  trends,
  showTrendsHint,
  className,
}: MetricsGridProps) {
  const profitPerDay = ordersPerDay * metrics.avgProfitPerOrder;
  return (
    <div className={cn("space-y-4", className)}>
      <h3 className="text-lg font-semibold text-white">Показатели</h3>

      {showTrendsHint && (
        <p className="text-xs text-white/20 text-center">
          Выберите период для сравнения с предыдущим
        </p>
      )}

      {/* Funnel pipeline */}
      <FunnelPipeline funnel={funnel} />

      {/* 2×3 cards grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Row 1 */}
        <StatsCard
          title="Средняя прибыль"
          value={formatPrice(metrics.avgProfitPerOrder)}
          subtitle="на заказ"
          color="green"
          trend={
            trends?.avgProfitPerOrder != null
              ? {
                  value: Math.abs(trends.avgProfitPerOrder),
                  isPositive: trends.avgProfitPerOrder >= 0,
                }
              : undefined
          }
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Лучший заказ"
          value={metrics.bestOrder ? formatPrice(metrics.bestOrder.profit) : "—"}
          subtitle={metrics.bestOrder?.productName || undefined}
          color="purple"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
          }
        />

        {/* Row 2 */}
        <StatsCard
          title="Заказов"
          value={`${totalOrders}`}
          subtitle={ordersPerDay > 0 ? `~${ordersPerDay}/день` : "за период"}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          }
        />
        <StatsCard
          title="Прибыль/день"
          value={profitPerDay > 0 ? formatPrice(Math.round(profitPerDay)) : "—"}
          subtitle="в среднем"
          color="green"
          trend={
            trends?.profitPerDay != null
              ? {
                  value: Math.abs(trends.profitPerDay),
                  isPositive: trends.profitPerDay >= 0,
                }
              : undefined
          }
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          }
        />

        {/* Row 3 */}
        <StatsCard
          title="Возвраты"
          value={`${metrics.returnRate}%`}
          subtitle={`${funnel.returned} ${getOrdersWord(funnel.returned)}${metrics.returnLoss > 0 ? ` · −${formatPrice(metrics.returnLoss)}` : ""}`}
          color="orange"
          trend={
            trends?.returnRate != null
              ? {
                  value: Math.abs(trends.returnRate),
                  isPositive: trends.returnRate > 0,
                  invertColor: true,
                }
              : undefined
          }
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
          }
        />
        <StatsCard
          title="Прибыль в пути"
          value={formatPrice(metrics.potentialProfit)}
          color="orange"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
      </div>
    </div>
  );
}

export function MetricsGridSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-24 bg-white/10 rounded" />
      {/* Funnel skeleton */}
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden p-4 animate-pulse",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "border border-glass"
        )}
      >
        <div className="flex items-center justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="text-center">
              <div className="h-2.5 w-12 bg-white/10 rounded mx-auto mb-1" />
              <div className="h-4 w-6 bg-white/10 rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>
      {/* Cards skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
