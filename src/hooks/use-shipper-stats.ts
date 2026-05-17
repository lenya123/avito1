import { useQuery } from "@tanstack/react-query";
import type { PendulumData } from "@/components/shipper/pendulum-bar";

// ─── Types ──────────────────────────────────────────────────────────

export type { PendulumData };

export interface ShipperStats {
  today: { orders: number; returns: number; earnings: number };
  month: { orders: number; returns: number; earnings: number };
  allTime: { orders: number; returns: number; earnings: number };
  dailyHistory: Array<{ date: string; orders: number; earnings: number }>;
  shipperRate: number;
  monthPayouts: number;
  pendingPayout: number;
  paymentMode: "dynamic" | "fixed";
  pendulum: PendulumData | null;
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useShipperStats() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["shipper-stats"],
    queryFn: async () => {
      const response = await fetch("/api/shipper/stats");
      if (!response.ok) throw new Error("Ошибка загрузки");
      const json = await response.json();
      return json.stats as ShipperStats;
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 3,
  });

  return { data, isLoading, error, refetch };
}
