import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  role: "owner" | "shipper" | "admin";
  name: string | null;
  avatarUrl: string | null;
  telegramUsername: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

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
        user: state.user,
        isInitialized: state.isInitialized,
      }),
    }
  )
);

export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => !!state.user);
export const useIsLoading = () => useAuthStore((state) => state.isLoading);
export const useAuthError = () => useAuthStore((state) => state.error);
