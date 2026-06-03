import { useQuery } from "@tanstack/react-query";
import type { Role } from "@/lib/roles/role-config";

export interface DashboardData {
  hero: {
    todayProfit: number;
    profitChange: number;
    profitSparkline: number[];
    monthlyTarget: number;
    monthlyProgress: number;
  };
  kpis: {
    revenue: { value: number; change: number; sparkline: number[] };
    orders: { value: number; change: number; sparkline: number[] };
    aov: { value: number; change: number; sparkline: number[] };
    roi: { value: number; change: number; sparkline: number[] };
  };
  alerts: Array<{
    id: string;
    type: "urgent" | "warning" | "info";
    title: string;
    message: string;
    count: number;
    actionUrl: string;
    actionLabel: string;
  }>;
  pipeline: {
    awaitingShipment: number;
    awaitingShipmentOverdue: number;
    collecting: number;
    collectingOverdue: number;
    inTransit: number;
    inTransitOverdue: number;
    completedToday: number;
    returns: number;
    slaHours: Record<string, number>;
  };
  shippers: Array<{
    id: string;
    name: string;
    shippedToday: number;
    elo: number;
    pendingOrders: number;
  }>;
  totalShippedToday: number;
  dailyGoal: number;
  fulfillment: {
    avgHoursToShip: number;
    avgHoursToDeliver: number;
    overdueCount: number;
    slaComplianceRate: number;
    rateToday: number;
    ordersPerShipper: number;
  };
  topProducts: Array<{
    id: string;
    name: string;
    photo: string | null;
    orders: number;
    revenue: number;
    profitMargin: number;
    returnRate: number;
    trend: "up" | "down" | "flat";
    lastSaleDate: string | null;
  }>;
  newCustomers: {
    last7d: number;
    last30d: number;
  };
  /** Касса — обязательства владельца (§9.2 баланс + §7.4 +ВАЙБ-долг). */
  treasury: {
    customerBalanceOwed: number;
    vibeDebtTotal: number;
  };
}

async function fetchDashboard(role: Role): Promise<DashboardData> {
  // Stage 1.5: seller-роль вырезана, дашборд — только owner.
  void role;
  const response = await fetch("/api/owner/dashboard");
  if (!response.ok) {
    throw new Error("Ошибка загрузки данных");
  }
  return response.json();
}

export function useDashboard(role: Role) {
  return useQuery({
    queryKey: [role, "dashboard"],
    queryFn: () => fetchDashboard(role),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}
