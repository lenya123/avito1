"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore, type NotificationSettings } from "@/stores/auth-store";

type NotificationKey = keyof NotificationSettings;

/**
 * Обновляет настройки уведомлений на сервере
 */
async function updateNotificationSettings(settings: Partial<NotificationSettings>) {
  const response = await fetch("/api/client/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Ошибка обновления настроек");
  }

  return response.json();
}

/**
 * Хук для работы с настройками уведомлений
 */
export function useNotificationSettings() {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();

  // Текущие настройки из store
  const settings = user?.notificationSettings ?? {
    orderStatus: true,
    newProducts: true,
    promotions: false,
  };

  // Мутация для обновления настроек
  const mutation = useMutation({
    mutationFn: updateNotificationSettings,
    onSuccess: (data) => {
      // Обновляем настройки в store
      updateUser({ notificationSettings: data.settings });
      // Инвалидируем кэш auth
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });

  // Функция для переключения отдельной настройки
  const toggleSetting = (key: NotificationKey) => {
    const newSettings = {
      ...settings,
      [key]: !settings[key],
    };

    // Optimistic update
    updateUser({ notificationSettings: newSettings });

    // Отправляем только изменённое поле
    mutation.mutate({ [key]: newSettings[key] });
  };

  // Функция для обновления нескольких настроек
  const updateSettings = (newSettings: Partial<NotificationSettings>) => {
    const mergedSettings = { ...settings, ...newSettings };

    // Optimistic update
    updateUser({ notificationSettings: mergedSettings });

    mutation.mutate(newSettings);
  };

  return {
    settings,
    toggleSetting,
    updateSettings,
    isUpdating: mutation.isPending,
    error: mutation.error?.message,
  };
}
