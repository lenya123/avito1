import { useQuery } from "@tanstack/react-query";

export interface ShipperDetailData {
  shipper: {
    id: string;
    name: string | null;
    telegramUsername: string | null;
    phone: string | null;
    shipperScore: number;
    workDays: number[] | null;
    workHourStart: number;
    workHourEnd: number;
    createdAt: string;
  };
  stats: {
    today: {
      orders: number;
      ordersTaken: number;
      returns: number;
      earnings: number;
      ordersAvailable: number;
      successRate: number | null;
    };
    month: {
      orders: number;
      ordersTaken: number;
      returns: number;
      earnings: number;
      successRate: number | null;
    };
    allTime: {
      orders: number;
      ordersTaken: number;
      returns: number;
      earnings: number;
      successRate: number | null;
    };
    dailyHistory: Array<{ date: string; label: string; orders: number; earnings: number }>;
    chartGranularity: "day" | "week" | "month";
    shipperRate: number;
    monthPayouts: number;
    pendingPayout: number;
    paymentMode: "pendulum" | "fixed";
    efficiency: {
      value: number;
      daysActive: number;
      workDaysPassed: number;
      currentRate: number;
      rateMin: number;
      rateMax: number;
      penaltyRate: number;
    } | null;
  };
  payouts: Array<{
    id: string;
    amount: number;
    note: string | null;
    created_at: string;
  }>;
}

export interface ShipperChartData {
  dailyHistory: Array<{ date: string; label: string; orders: number; earnings: number }>;
  chartGranularity: "day" | "week" | "month";
}

async function fetchShipperDetail(id: string): Promise<ShipperDetailData> {
  const response = await fetch(`/api/owner/shippers/${id}/stats`);
  if (!response.ok) {
    throw new Error("Ошибка загрузки данных отправщика");
  }
  return response.json();
}

async function fetchShipperChart(
  id: string,
  dateFrom: string,
  dateTo: string
): Promise<ShipperChartData> {
  const params = new URLSearchParams({ dateFrom, dateTo });
  const response = await fetch(`/api/owner/shippers/${id}/stats?${params}`);
  if (!response.ok) {
    throw new Error("Ошибка загрузки графика");
  }
  const data: ShipperDetailData = await response.json();
  return { dailyHistory: data.stats.dailyHistory, chartGranularity: data.stats.chartGranularity };
}

export function useOwnerShipperDetail(id: string) {
  return useQuery({
    queryKey: ["owner", "shipper", id],
    queryFn: () => fetchShipperDetail(id),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useShipperChart(id: string, dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["owner", "shipper-chart", id, dateFrom, dateTo],
    queryFn: () => fetchShipperChart(id, dateFrom, dateTo),
    enabled: !!id && !!dateFrom && !!dateTo,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}
