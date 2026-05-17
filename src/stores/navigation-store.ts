import { create } from "zustand";

interface NavigationState {
  /** Целевой href, на который идёт навигация */
  targetHref: string | null;
  /** Начало навигации - мгновенно устанавливает targetHref */
  startNavigation: (href: string) => void;
  /** Завершение навигации - сбрасывает targetHref */
  endNavigation: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  targetHref: null,

  startNavigation: (href) => {
    set({ targetHref: href });
  },

  endNavigation: () => {
    set({ targetHref: null });
  },
}));

// Селекторы
export const useIsNavigating = () => useNavigationStore((state) => state.targetHref !== null);
export const useTargetHref = () => useNavigationStore((state) => state.targetHref);
