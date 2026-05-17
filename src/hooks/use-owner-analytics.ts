import { useQuery } from "@tanstack/react-query";

export interface AnalyticsResponse {
  period: {
    from: string;
    to: string;
    label: string;
  };
  sales: {
    stats: {
      totalOrders: number;
      completedOrders: number;
      revenue: number;
      cost: number;
      profit: number;
    };
    chart: Array<{
      date: string;
      orders: number;
      revenue: number;
      profit: number;
    }>;
  };
  clients: {
    stats: {
      total: number;
      new: number;
      active: number;
      byLevel: {
        level0: number;
        level1: number;
        level2: number;
        level3: number;
      };
    };
  };
  products: {
    stats: {
      total: number;
      active: number;
      totalStock: number;
    };
    categories: Array<{
      name: string;
      count: number;
    }>;
    top: Array<{
      id: string;
      name: string;
      photo: string | null;
      orders: number;
      revenue: number;
    }>;
  };
  topClients: Array<{
    id: string;
    username: string | null;
    name: string | null;
    orders: number;
    revenue: number;
  }>;
}

export interface AnalyticsFilters {
  period?: "week" | "month" | "quarter" | "year";
  dateFrom?: string;
  dateTo?: string;
}

async function fetchAnalytics(filters: AnalyticsFilters): Promise<AnalyticsResponse> {
  const params = new URLSearchParams();

  if (filters.period) params.set("period", filters.period);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  const response = await fetch(`/api/owner/analytics?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Ошибка загрузки аналитики");
  }
  return response.json();
}

export function useOwnerAnalytics(filters: AnalyticsFilters = {}) {
  return useQuery({
    queryKey: ["owner", "analytics", filters],
    queryFn: () => fetchAnalytics(filters),
    staleTime: 60000, // 1 минута
  });
}

export const PERIOD_OPTIONS = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
] as const;
