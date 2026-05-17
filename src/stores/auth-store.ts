import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NotificationSettings {
  orderStatus: boolean;
  newProducts: boolean;
  promotions: boolean;
}

export interface AuthUser {
  id: string;
  role: "owner" | "shipper" | "client";
  name: string | null;
  avatarUrl: string | null;
  telegramUsername: string | null;
  level: number;
  deposit: number;
  referralDeposit: number;
  depositLimit: number;
  isVibePlus: boolean;
  subscriptionTier: "none" | "basic" | "premium" | "top_floor_boss";
  subscriptionEnd: string | null;
  scheduledSubscriptionTier: "basic" | "premium" | "top_floor_boss" | null;
  discountPercent: number;
  completedOrdersCount: number;
  referralCode: string | null;
  referralCount: number;
  referralEarned: number;
  isOnboardingCompleted: boolean;
  firstOrderDiscountUsed: boolean;
  notificationSettings: NotificationSettings;
  hasAvitoCredentials: boolean;
  avitoAccountLimit: number;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  login: (siteKey: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  updateUser: (data: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isInitialized: false,
      error: null,

      login: async (siteKey: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ siteKey }),
          });

          const data = await response.json();

          if (!response.ok) {
            set({
              isLoading: false,
              error: data.error || "Ошибка авторизации",
            });
            return false;
          }

          set({
            user: data.user,
            isLoading: false,
            isInitialized: true,
            error: null,
          });

          return true;
        } catch {
          set({
            isLoading: false,
            error: "Ошибка сети. Попробуйте позже.",
          });
          return false;
        }
      },

      logout: async () => {
        set({ isLoading: true });

        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch (error) {
          console.error("Logout error:", error);
        }

        set({
          user: null,
          isLoading: false,
          error: null,
        });
      },

      checkAuth: async () => {
        const currentUser = get().user;
        // Если есть кэшированный user — не показываем loading (background refresh)
        if (!currentUser) {
          set({ isLoading: true });
        }

        try {
          const response = await fetch("/api/auth/me");
          const data = await response.json();

          if (response.ok && data.user) {
            set({
              user: data.user,
              isLoading: false,
              isInitialized: true,
            });
          } else {
            set({
              user: null,
              isLoading: false,
              isInitialized: true,
            });
          }
        } catch {
          // При ошибке сети — сохраняем кэшированного user если есть
          set({
            user: currentUser,
            isLoading: false,
            isInitialized: true,
          });
        }
      },

      clearError: () => set({ error: null }),

      updateUser: (data) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...data } });
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        // Кэшируем user для мгновенного отображения имени/аватарки при загрузке
        user: state.user,
        isInitialized: state.isInitialized,
      }),
    }
  )
);

// Селекторы для удобства
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => !!state.user);
export const useIsLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthError = () => useAuthStore((state) => state.error);
