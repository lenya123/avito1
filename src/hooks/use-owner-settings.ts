import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface OwnerSettings {
  // Orders & clients
  firstOrderDiscount: number;
  reservationTimeoutMinutes: number;
  // Returns
  returnToTrashDays: number;
  trashToDisposedDays: number;
  // Shipper streaks
  dailyGoal: number;
  dailyGoalBonus: number;
  streakMultiplier3: number;
  streakMultiplier7: number;
  streakKeepThreshold: number;
  // Shipper payment (2 режима, канон §9.5/9.6)
  shipperRate: number;
  shipperFixedRate: number;
  shipperPaymentMode: "pendulum" | "fixed";
  // Pendulum
  rateMin: number;
  rateBase: number;
  rateMax: number;
  speedTargetHours: number;
  avgWindowDays: number;
  minWorkDays: number;
  // Analytics
  statsWindowDays: number;
  // Goals
  monthlyProfitTarget: number;
  // Contacts
  ownerTelegramUsername: string;
  supportTelegramUsername: string;
  // Location
  defaultLocationCity: string;
  // Shipper payouts schedule
  payoutCadence: "weekly" | "biweekly" | "monthly";
  payoutWeekday: number;
  payoutReserveDays: number;
  // Business (business_settings) — UI показывает +ВАЙБ-поля и расписание digest'ов.
  // Остальные поля (businessName, paymentRequisitesMessage) живут в БД без UI.
  vibeCreditDefaultLimit: number;
  vibeReceiptConfirmThreshold: number | null;
  // Расписание сводок директора и партнёров.
  // Время в формате "HH:MM" (МСК), step — в часах (1..12).
  directorNotifyWindowStart: string;
  directorNotifyWindowEnd: string;
  directorDigestStepHours: number;
  partnerNotifyWindowStart: string;
  partnerNotifyWindowEnd: string;
  partnerDigestStepHours: number;
  // Окно отправки trumpet-напоминаний клиентам (общее для shipper-trumpet
  // владельца и partner-trumpet — это всегда контакт с клиентом).
  trumpetNotifyWindowStart: string;
  trumpetNotifyWindowEnd: string;
  // Meta
  updatedAt: string | null;
}

async function fetchSettings(): Promise<OwnerSettings> {
  const response = await fetch("/api/owner/settings");
  if (!response.ok) throw new Error("Ошибка загрузки настроек");
  return response.json();
}

async function updateSettings(data: Partial<OwnerSettings>) {
  const response = await fetch("/api/owner/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Ошибка сохранения");
  }
  return response.json();
}

export function useOwnerSettings() {
  return useQuery({
    queryKey: ["owner", "settings"],
    queryFn: fetchSettings,
    staleTime: 60000,
  });
}

export function useUpdateOwnerSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "settings"] });
    },
  });
}
