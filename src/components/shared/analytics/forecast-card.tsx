"use client";

import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import type { OwnerAnalyticsResponse } from "@/hooks/use-owner-analytics";

interface ForecastCardProps {
  forecast: OwnerAnalyticsResponse["forecast"];
  backlog: number;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-2xs font-medium",
        delta > 0 ? "text-accent-green" : "text-accent-red"
      )}
    >
      <svg
        className={cn("w-2.5 h-2.5", delta < 0 && "rotate-180")}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M5 10l7-7m0 0l7 7m-7-7v18"
        />
      </svg>
      {delta > 0 ? "+" : ""}
      {delta}%
    </span>
  );
}

export function ForecastCard({ forecast }: ForecastCardProps) {
  const projRevenue = Math.round(forecast.avgRevenuePerDay * 30);
  const projProfit = Math.round(forecast.avgProfitPerDay * 30);
  const projOrders = Math.round(forecast.avgOrdersPerDay * 30);
  const daysOfStock =
    forecast.avgStockVelocityPerDay > 0
      ? Math.round(forecast.totalStock / forecast.avgStockVelocityPerDay)
      : null;
  const projPurchase = Math.round(forecast.avgOrdersPerDay * 30 * forecast.avgOrderCost);

  // Ranges (±20%)
  const revenueLow = Math.round(projRevenue * 0.8);
  const revenueHigh = Math.round(projRevenue * 1.2);
  const profitLow = Math.round(projProfit * 0.8);
  const profitHigh = Math.round(projProfit * 1.2);
  const ordersLow = Math.round(projOrders * 0.8);
  const ordersHigh = Math.round(projOrders * 1.2);

  const revenueDelta =
    forecast.prevAvgRevenuePerDay > 0
      ? Math.round(
          ((forecast.avgRevenuePerDay - forecast.prevAvgRevenuePerDay) /
            forecast.prevAvgRevenuePerDay) *
            100
        )
      : null;
  const profitDelta =
    forecast.prevAvgProfitPerDay > 0
      ? Math.round(
          ((forecast.avgProfitPerDay - forecast.prevAvgProfitPerDay) /
            forecast.prevAvgProfitPerDay) *
            100
        )
      : null;
  const ordersDelta =
    forecast.prevAvgOrdersPerDay > 0
      ? Math.round(
          ((forecast.avgOrdersPerDay - forecast.prevAvgOrdersPerDay) /
            forecast.prevAvgOrdersPerDay) *
            100
        )
      : null;

  // Stock display: cap at 90+
  const displayStock =
    daysOfStock !== null ? (daysOfStock > 90 ? "90+ дн." : `${daysOfStock} дн.`) : "---";
  const stockColor =
    daysOfStock !== null && daysOfStock < 14
      ? "text-accent-red"
      : daysOfStock !== null && daysOfStock < 30
        ? "text-accent-orange"
        : "text-accent-green";

  const showPurchaseAlert = daysOfStock !== null && daysOfStock < 30;

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Прогноз на 30 дней</h3>

        <div className="space-y-2.5">
          {/* Revenue */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Выручка</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{formatPrice(projRevenue)}</span>
                <DeltaBadge delta={revenueDelta} />
              </div>
            </div>
            {projRevenue > 0 && (
              <p className="text-right text-2xs text-white/20">
                {formatPrice(revenueLow)} — {formatPrice(revenueHigh)}
              </p>
            )}
          </div>

          {/* Profit */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Прибыль</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-accent-green">
                  {formatPrice(projProfit)}
                </span>
                <DeltaBadge delta={profitDelta} />
              </div>
            </div>
            {projProfit > 0 && (
              <p className="text-right text-2xs text-white/20">
                {formatPrice(profitLow)} — {formatPrice(profitHigh)}
              </p>
            )}
          </div>

          {/* Orders */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Заказы</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{projOrders}</span>
                <DeltaBadge delta={ordersDelta} />
              </div>
            </div>
            {projOrders > 0 && (
              <p className="text-right text-2xs text-white/20">
                {ordersLow} — {ordersHigh}
              </p>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-3 pt-3 border-t border-glass-subtle space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Товара хватит на</span>
            <span className={cn("text-sm font-medium", stockColor)}>{displayStock}</span>
          </div>
          {showPurchaseAlert && (
            <p className="text-xs text-white/50">
              <span className="text-accent-orange">Нужно закупить:</span>{" "}
              {formatPrice(projPurchase)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
