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

// Канон §9.5/9.6 — 2 режима: pendulum (ELO-рейтинг → ставка) | fixed.
export interface PendulumSettings {
  paymentMode?: "pendulum" | "fixed";
  fixedRate?: number;
  rateMin?: number;
  rateMax?: number;
}

export interface PendulumSettingsData {
  paymentMode: "pendulum" | "fixed";
  fixedRate: number;
  rateMin: number;
  rateMax: number;
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

// useCreatePayout (POST /api/shipper/payouts) удалён 2026-05-18: была
// дыра — отправщик записывал себе выплату любой суммы. Сервер закрыл
// POST/PATCH ещё раньше; клиент-обёртка была мёртвой. Создание выплат —
// операция владельца (§9.7) через owner-finance (shipper_payouts).
