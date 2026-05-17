import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ShipperUser {
  id: string;
  role: "shipper";
  name: string | null;
  telegramUsername: string | null;
}

interface ShipperAuthState {
  user: ShipperUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  login: (siteKey: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useShipperAuthStore = create<ShipperAuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      isInitialized: false,
      error: null,

      login: async (siteKey: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch("/api/shipper/auth/login", {
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
        set({ isLoading: true });

        try {
          const response = await fetch("/api/auth/me");
          const data = await response.json();

          if (response.ok && data.user && data.user.role === "shipper") {
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
          set({
            user: null,
            isLoading: false,
            isInitialized: true,
          });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "shipper-auth-storage",
      partialize: (state) => ({
        isInitialized: state.isInitialized,
      }),
    }
  )
);

// Selectors
export const useShipperUser = () => useShipperAuthStore((state) => state.user);
export const useIsShipperAuthenticated = () => useShipperAuthStore((state) => !!state.user);
export const useShipperLoading = () => useShipperAuthStore((state) => state.isLoading);
export const useShipperError = () => useShipperAuthStore((state) => state.error);
