import { useQuery } from "@tanstack/react-query";

// ===== Response Types =====

export interface OwnerAnalyticsResponse {
  period: {
    from: string;
    to: string;
    label: string;
  };

  // Группа 1: Financial Hero
  financial: {
    revenue: number;
    cost: number;
    profit: number;
    roiPercent: number;
    aov: number;
    profitChange: number | null;
    revenueChange: number | null;
    costChange: number | null;
    aovChange: number | null;
    roiChange: number | null;
  };

  // §15.5: суммы расходов канала Avito.
  channels?: {
    avito_fees: number;
    avito_marketing: number;
  };

  // Группа 2: Trend Chart
  chart: Array<{
    date: string;
    revenue: number;
    profit: number;
    orders: number;
    aov: number;
    roiPercent: number;
    /** Σ расходов за бакет (метрика «Расходы» в TrendChart). */
    expenses: number;
  }>;
  comparisonChart: Array<{
    date: string;
    revenue: number;
    profit: number;
    orders: number;
    aov: number;
    roiPercent: number;
    expenses: number;
  }> | null;

  // Группа 3: Funnel
  funnel: {
    awaitingShipment: number;
    collecting: number;
    inTransit: number;
    completed: number;
    returned: number;
    problem: number;
    cancelled: number;
  };

  // Группа 3: Insights
  insights: Array<{
    type: string;
    severity: "positive" | "warning" | "info" | "celebration";
    title: string;
    body: string;
  }>;

  // Группа 4: Product Matrix
  productMatrix: Array<{
    id: string;
    name: string;
    photo: string | null;
    category: string;
    orders: number;
    revenue: number;
    profit: number;
    roiPercent: number;
    returnRate: number;
    stockRemaining: number;
    turnoverDays: number | null;
    trend: number;
    trendRevenue: number;
    trendProfit: number;
    trendOrders: number;
    lossUnits: number;
    lossRub: number;
    abcClass: "A" | "B" | "C";
  }>;
  categories: Array<{
    name: string;
    productCount: number;
    orders: number;
    revenue: number;
    profit: number;
    roiPercent: number;
    revenueShare: number;
  }>;

  // Группа 5: Clients
  clientStats: {
    total: number;
    active: number;
    new: number;
    loyal: number;
    churned: number;
    repeatPurchaseRate: number;
    avgOrdersPerClient: number;
    revenuePerClient: number;
    newRevenue: number;
    returningRevenue: number;
  };
  topClients: Array<{
    id: string;
    username: string | null;
    name: string | null;
    revenue: number;
    profit: number;
    orders: number;
    aov: number;
    lastOrderDate: string | null;
    revenueShare: number;
  }>;

  // Группа 6: Strategy
  healthScore: {
    total: number;
    trend: number;
    profitability: number;
    fulfillment: number;
    growth: number;
    clientHealth: number;
    interpretation: string;
  };
  operational: {
    avgFulfillmentDays: number;
    avgDeliveryDays: number;
    pendingBacklog: number;
    clientDepositPool: number;
    shipperEfficiency: number;
    problemRate: number;
  };
  /** Сводка финансов для карточки-моста (см. /owner/finance — журналы и
   *  Касса; здесь только агрегаты для дашборд-карточки на Аналитике). */
  financeSummary: {
    /** Чистая прибыль = валовая §9.4 − Σ расходы − Σ выплаты (за период). */
    netProfit: number;
    totalExpenses: number;
    expensesCount: number;
    totalPayouts: number;
    payoutsCount: number;
    /** Обязательства / ожидаемые поступления — point-in-time (§9.8/§10.4). */
    treasury: {
      customerBalanceOwed: number;
      vibeDebtTotal: number;
      partnerDebtOwed: number;
    };
  };
  forecast: {
    avgRevenuePerDay: number;
    avgProfitPerDay: number;
    avgOrdersPerDay: number;
    avgOrderCost: number;
    growthRate: number;
    totalStock: number;
    avgStockVelocityPerDay: number;
    prevAvgRevenuePerDay: number;
    prevAvgProfitPerDay: number;
    prevAvgOrdersPerDay: number;
  };
  ordersByDayOfWeek: number[];
}

// ===== Filters =====

export interface OwnerAnalyticsFilters {
  period?: "week" | "month" | "quarter" | "year" | "custom";
  granularity?: "day" | "week" | "month";
  dateFrom?: string;
  dateTo?: string;
  compare?: boolean;
  /** §15: фильтр канала сбыта (all | drop | avito). */
  channel?: "all" | "drop" | "avito";
}

// ===== Fetch =====

async function fetchAnalytics(filters: OwnerAnalyticsFilters): Promise<OwnerAnalyticsResponse> {
  const params = new URLSearchParams();

  if (filters.period) params.set("period", filters.period);
  if (filters.granularity) params.set("granularity", filters.granularity);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.compare) params.set("compare", "true");
  if (filters.channel && filters.channel !== "all") params.set("channel", filters.channel);

  const response = await fetch(`/api/owner/analytics?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Ошибка загрузки аналитики");
  }
  return response.json();
}

export function useOwnerAnalytics(filters: OwnerAnalyticsFilters = {}) {
  return useQuery({
    queryKey: ["owner", "analytics", filters],
    queryFn: () => fetchAnalytics(filters),
    staleTime: 60000,
  });
}

// ===== Period Options =====

export const PERIOD_OPTIONS = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
  { value: "custom", label: "Свой период" },
] as const;

export const GRANULARITY_OPTIONS = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
] as const;
