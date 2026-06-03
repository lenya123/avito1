"use client";

import { useEffect, useRef } from "react";
import { useAuthStore, useUser, useIsAuthenticated, useIsLoading } from "@/stores/auth-store";

export function useAuth() {
  const user = useUser();
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useIsLoading();
  const { logout, checkAuth, error, clearError, isInitialized } = useAuthStore();
  const hasCheckedRef = useRef(false);

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
    logout,
    clearError,
  };
}

export function useRequireAuth(allowedRoles?: ("owner" | "shipper" | "admin")[]) {
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
