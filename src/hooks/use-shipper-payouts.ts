import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ShipperPayout {
  id: string;
  amount: number;
  note: string | null;
  created_at: string;
}

export function useShipperPayouts() {
  return useQuery({
    queryKey: ["shipper-payouts"],
    queryFn: async () => {
      const response = await fetch("/api/shipper/payouts");
      if (!response.ok) throw new Error("Ошибка загрузки выплат");
      const json = await response.json();
      return json.payouts as ShipperPayout[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

export interface PendulumSettings {
  paymentMode?: "fixed" | "dynamic";
  fixedRate?: number;
  rateMin?: number;
  rateBase?: number;
  rateMax?: number;
  speedTargetHours?: number;
  avgWindowDays?: number;
  minWorkDays?: number;
}

export interface PendulumSettingsData {
  paymentMode: "fixed" | "dynamic";
  fixedRate: number;
  rateMin: number;
  rateBase: number;
  rateMax: number;
  speedTargetHours: number;
  avgWindowDays: number;
  minWorkDays: number;
}

export function useOwnerPendulumSettings() {
  return useQuery({
    queryKey: ["owner", "pendulum-settings"],
    queryFn: async () => {
      const response = await fetch("/api/owner/settings");
      if (!response.ok) throw new Error("Ошибка загрузки");
      return (await response.json()) as PendulumSettingsData;
    },
    staleTime: 60 * 1000,
  });
}

export function useUpdatePendulumSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: PendulumSettings) => {
      const response = await fetch("/api/owner/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка обновления настроек");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "pendulum-settings"] });
      queryClient.invalidateQueries({ queryKey: ["shipper-stats"] });
    },
  });
}

export function useCreatePayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ amount, note }: { amount: number; note?: string }) => {
      const response = await fetch("/api/shipper/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Ошибка записи выплаты");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipper-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["shipper-stats"] });
    },
  });
}
