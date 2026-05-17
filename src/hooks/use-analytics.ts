"use client";

import { useQuery } from "@tanstack/react-query";
import type { Insight } from "@/lib/analytics/insights-engine";

export type AnalyticsPeriod = "week" | "month" | "quarter" | "all" | "custom";

export type AnalyticsResponse = {
  financial: {
    totalProfit: number;
    totalInvested: number;
    totalRevenue: number;
    roi: number;
    profitTrend: number;
    activeOrdersCount: number;
    potentialProfit: number;
    activeInvested: number;
  };
  healthScore: {
    total: number;
    trend: number;
    profitability: number;
    selectionAccuracy: number;
    activity: number;
    growth: number;
    interpretation: string;
  };
  metrics: {
    avgProfitPerOrder: number;
    bestOrder: {
      profit: number;
      productName: string;
      productPhoto: string | null;
    } | null;
    avgMargin: number;
    potentialProfit: number;
    conversionRate: number;
    returnRate: number;
    cancelRate: number;
    avgDeliveryDays: number;
    returnLoss: number;
  };
  // Для планировщика
  periodCompletedCount: number;
  conversionRate: number;
  funnel: {
    created: number;
    paid: number;
    shipped: number;
    delivered: number;
    returned: number;
    cancelled: number;
  };
  moneyCycle: {
    avgCycleDays: number;
    avgRemainingDays: number;
    pendingShipmentCount: number;
    pendingShipmentInvested: number;
    byService: Array<{
      service: string;
      avgDays: number;
      ordersCount: number;
    }>;
  };
  products: Array<{
    id: string;
    name: string;
    photoUrl: string | null;
    ordersCount: number;
    totalProfit: number;
    totalRevenue: number;
    totalInvested: number;
    avgProfitPerOrder: number;
    roi: number;
    returnRate: number;
    returnLoss: number;
    sizes: Record<string, number>;
  }>;
  delivery: Array<{
    service: string;
    ordersCount: number;
    avgDeliveryDays: number;
    latePercent: number;
    returnPercent: number;
  }>;
  sizes: Record<string, number>;
  progress: {
    level: number;
    nextLevel: number | null;
    completedOrders: number;
    ordersToNextLevel: number | null;
    estimatedDaysToNextLevel: number | null;
    discountPercent: number;
    nextDiscountPercent: number | null;
  };
  insights: Insight[];
  deposit: number;
  referralDeposit: number;
  avgOrderPrice: number;
  ordersPerDay: number;
  referralCount: number;
  referralEarned: number;
  activeReferrals: number;
  trends?: {
    avgProfitPerOrder: number | null;
    roi: number | null;
    returnRate: number | null;
    conversionRate: number | null;
    profitPerDay: number | null;
  };
  period: string;
  planner: {
    completedAvgPrice: number;
    avgProfitPerOrder: number;
    avgCycleDays: number;
    conversionRate: number;
    ordersPerDay: number;
    completedOrders: number;
  };
};

async function fetchAnalytics(
  period: AnalyticsPeriod,
  dateFrom?: string,
  dateTo?: string
): Promise<AnalyticsResponse> {
  const params = new URLSearchParams({ period });
  if (period === "custom") {
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
  }

  const response = await fetch(`/api/stats/analytics?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка загрузки аналитики");
  }

  return response.json();
}

export function useAnalytics(
  period: AnalyticsPeriod = "month",
  enabled: boolean = true,
  dateFrom?: string,
  dateTo?: string
) {
  return useQuery({
    queryKey: ["analytics", period, dateFrom, dateTo],
    queryFn: () => fetchAnalytics(period, dateFrom, dateTo),
    staleTime: 60 * 1000,
    enabled,
  });
}
