"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import type { SubscriptionTier } from "@/lib/constants/subscriptions";

type ChangeSubscriptionInput = {
  tier: Exclude<SubscriptionTier, "none">;
  avitoAccountLimit?: number;
};

type ChangeSubscriptionResponse = {
  success: boolean;
  message: string;
  subscription: {
    tier?: SubscriptionTier;
    name?: string;
    subscriptionEnd?: string;
    price?: number;
    isUpgrade?: boolean;
    currentTier?: SubscriptionTier;
    scheduledTier?: SubscriptionTier;
    scheduledDate?: string;
  };
};

/**
 * Отправляет запрос на смену тарифа
 */
async function changeSubscription(
  input: ChangeSubscriptionInput
): Promise<ChangeSubscriptionResponse> {
  const response = await fetch("/api/client/subscription/change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Ошибка смены тарифа");
  }

  return data;
}

/**
 * Хук для смены тарифа подписки
 */
export function useSubscriptionChange() {
  const queryClient = useQueryClient();
  const { checkAuth } = useAuthStore();

  return useMutation({
    mutationFn: changeSubscription,
    onSuccess: () => {
      // Обновляем данные пользователя
      checkAuth();
      // Инвалидируем кэш
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
}

/**
 * Хук для отмены запланированной смены тарифа
 */
export function useCancelScheduledSubscription() {
  const { checkAuth } = useAuthStore();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/client/subscription/cancel-scheduled", {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Ошибка отмены");
      }
      return data;
    },
    onSuccess: () => {
      checkAuth();
    },
  });
}

/**
 * Хук для получения информации о текущей подписке
 */
export function useSubscription() {
  const { user } = useAuthStore();

  const tier = user?.subscriptionTier ?? "none";
  const subscriptionEnd = user?.subscriptionEnd;
  const isVibePlus = user?.isVibePlus ?? false;
  const scheduledTier = user?.scheduledSubscriptionTier ?? null;

  // Проверяем активность подписки
  const isActive = subscriptionEnd ? new Date(subscriptionEnd) > new Date() : false;

  // +ВАЙБ всегда имеют доступ
  const hasAccess = isVibePlus || (tier !== "none" && isActive);

  // Дни до окончания
  const daysRemaining = subscriptionEnd
    ? Math.max(
        0,
        Math.ceil((new Date(subscriptionEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      )
    : 0;

  return {
    tier,
    subscriptionEnd,
    isActive,
    hasAccess,
    isVibePlus,
    daysRemaining,
    scheduledTier,
  };
}
