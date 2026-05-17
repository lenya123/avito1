"use client";

import { useEffect, useRef } from "react";
import { useAuthStore, useUser, useIsAuthenticated, useIsLoading } from "@/stores/auth-store";

export function useAuth() {
  const user = useUser();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useIsLoading();
  const { login, logout, checkAuth, error, clearError, isInitialized } = useAuthStore();
  const hasCheckedRef = useRef(false);

  // Всегда проверяем авторизацию при монтировании (background refresh)
  // Кэшированные данные покажутся сразу, а свежие подгрузятся в фоне
  useEffect(() => {
    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true;
      checkAuth();
    }
  }, [checkAuth]);

  return {
    user,
    isAuthenticated,
    isLoading,
    isInitialized,
    error,
    login,
    logout,
    clearError,
  };
}

// Хук для проверки роли
export function useRequireAuth(allowedRoles?: ("owner" | "shipper" | "client")[]) {
  const { user, isAuthenticated, isLoading, isInitialized } = useAuth();

  const hasAccess =
    isAuthenticated && (!allowedRoles || (user && allowedRoles.includes(user.role)));

  return {
    user,
    isAuthenticated,
    isLoading,
    isInitialized,
    hasAccess,
  };
}

// Хук для получения уровня и скидок
export function useUserLevel() {
  const user = useUser();

  if (!user) {
    return {
      level: 0,
      discountPercent: 0,
      isVibePlus: false,
      canOrderInTransit: false,
      maxOrdersPerDay: 10,
    };
  }

  const canOrderInTransit =
    user.isVibePlus ||
    user.subscriptionTier === "premium" ||
    user.subscriptionTier === "top_floor_boss";

  const maxOrdersPerDay =
    user.level === 3 || user.isVibePlus ? 999 : user.level === 2 ? 30 : user.level === 1 ? 20 : 10;

  return {
    level: user.level,
    discountPercent: user.discountPercent,
    isVibePlus: user.isVibePlus,
    canOrderInTransit,
    maxOrdersPerDay,
  };
}

// Хук для баланса
export function useBalance() {
  const user = useUser();

  return {
    deposit: user?.deposit ?? 0,
    referralDeposit: user?.referralDeposit ?? 0,
    total: (user?.deposit ?? 0) + (user?.referralDeposit ?? 0),
  };
}
