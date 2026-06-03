"use client";

import { useOwnerAuthStore, useOwnerUser } from "@/stores/owner-auth-store";
import { useOwnerNotifications } from "@/hooks/use-owner-notifications";
import { NavIcons } from "@/components/layouts/nav-icons";
import type { RoleConfig, UseNotificationsResult } from "./role-config";

const OWNER_LOGO = (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  </svg>
);

function useOwnerAuthState() {
  const isInitialized = useOwnerAuthStore((s) => s.isInitialized);
  const isLoading = useOwnerAuthStore((s) => s.isLoading);
  return { isInitialized, isLoading };
}

async function ownerLogout() {
  await useOwnerAuthStore.getState().logout();
}

function useOwnerNotificationsAdapter(limit: number): UseNotificationsResult {
  const result = useOwnerNotifications(limit);
  return { data: result.data, isLoading: result.isLoading };
}

export const ownerConfig: RoleConfig = {
  role: "owner",
  basePath: "/owner",
  loginPath: "/owner/login",
  brand: {
    title: "Avito Drop",
    subtitle: "Управление",
    accentClass: "text-accent-purple",
    bgGradient: "from-purple-500/20 to-pink-500/10",
    borderClass: "border-purple-500/25",
    shadowClass: "shadow-[0_0_16px_rgba(191,90,242,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]",
    indicatorGradient: "from-accent-purple to-accent-pink",
    logoIcon: OWNER_LOGO,
  },
  sidebarItems: [
    { href: "/owner/dashboard", icon: <NavIcons.dashboard />, label: "Дашборд" },
    { href: "/owner/orders", icon: <NavIcons.orders />, label: "Заказы" },
    { href: "/owner/products", icon: <NavIcons.products />, label: "Товары" },
    { href: "/owner/clients", icon: <NavIcons.clients />, label: "Клиенты" },
    { href: "/owner/finance", icon: <NavIcons.finance />, label: "Финансы" },
    { href: "/owner/analytics", icon: <NavIcons.analytics />, label: "Аналитика" },
    { href: "/owner/shippers", icon: <NavIcons.shippers />, label: "Отправщики" },
    { href: "/owner/partners", icon: <NavIcons.sellers />, label: "Партнёры" },
    { href: "/owner/avito", icon: <NavIcons.avito />, label: "Авито Магазины" },
    { href: "/owner/security", icon: <NavIcons.security />, label: "Безопасность" },
    { href: "/owner/settings", icon: <NavIcons.settings />, label: "Настройки" },
  ],
  mobileNavItems: [
    { href: "/owner/dashboard", icon: <NavIcons.dashboard />, label: "Дашборд" },
    { href: "/owner/orders", icon: <NavIcons.orders />, label: "Заказы" },
    { href: "/owner/products", icon: <NavIcons.products />, label: "Товары" },
    { href: "/owner/clients", icon: <NavIcons.clients />, label: "Клиенты" },
    { href: "/owner/more", icon: <NavIcons.more />, label: "Ещё" },
  ],
  features: {
    search: true,
    notifications: true,
    moreMenu: true,
  },
  endpoints: {
    search: "/api/owner/search",
  },
  useAuthUser: useOwnerUser,
  useAuthState: useOwnerAuthState,
  logout: ownerLogout,
  useNotifications: useOwnerNotificationsAdapter,
};
