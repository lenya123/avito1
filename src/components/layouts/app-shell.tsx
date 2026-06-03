"use client";

import { useMemo, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigationStore } from "@/stores/navigation-store";
import { BottomNav, Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";
import type { RoleConfig } from "@/lib/roles/role-config";
import { NotificationBell } from "./notification-bell";
import { NotificationPanel } from "./notification-panel";
import { GlobalSearchPanel } from "./global-search-panel";

interface Props {
  config: RoleConfig;
  children: React.ReactNode;
}

export function AppShell({ config, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const targetHref = useNavigationStore((state) => state.targetHref);
  const user = config.useAuthUser();
  const { isInitialized, isLoading } = config.useAuthState();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const initAuth = config.initAuth;
  const authGated = !!initAuth;
  useEffect(() => {
    if (initAuth && !isInitialized) initAuth();
  }, [initAuth, isInitialized]);

  const isLoginPage = pathname === config.loginPath;
  const isNavigating = targetHref !== null && targetHref !== pathname;

  useEffect(() => {
    if (authGated && isInitialized && !user && !isLoading && !isLoginPage) {
      router.replace(config.loginPath);
    }
  }, [authGated, isInitialized, user, isLoading, isLoginPage, router, config.loginPath]);

  const activeHref = useMemo(() => {
    const match = config.sidebarItems.find(
      (item) => pathname === item.href || pathname.startsWith(item.href + "/")
    );
    if (match) return match.href;
    const dashboard = config.sidebarItems[0]?.href ?? config.basePath;
    if (pathname === config.basePath) return dashboard;
    return dashboard;
  }, [pathname, config.sidebarItems, config.basePath]);

  const handleLogout = async () => {
    await config.logout();
    router.replace(config.loginPath);
  };

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (authGated && (!isInitialized || isLoading)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-primary">
        <Spinner size="lg" />
      </div>
    );
  }

  if (authGated && !user) return null;

  const { brand } = config;
  const notificationsEnabled = config.features.notifications && !!config.useNotifications;
  const searchEnabled = config.features.search && !!config.endpoints.search;

  return (
    <div className="min-h-dvh bg-primary flex">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col w-64 fixed inset-y-0 left-0 z-40",
          "bg-gradient-to-b from-white/[0.06] to-white/[0.03]",
          "backdrop-blur-xl",
          "border-r border-glass"
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-glass">
          <Link
            href={config.sidebarItems[0]?.href || config.basePath}
            className="flex items-center gap-3"
          >
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                "bg-gradient-to-br",
                brand.bgGradient,
                "border",
                brand.borderClass,
                brand.shadowClass
              )}
            >
              <span className={cn("w-5 h-5 flex items-center justify-center", brand.accentClass)}>
                {brand.logoIcon}
              </span>
            </div>
            <div>
              <h1 className="font-semibold text-white">{brand.title}</h1>
              <p className="text-xs text-white/40">{brand.subtitle}</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto">
          <ul className="space-y-1">
            {config.sidebarItems.map((item) => {
              const isActive = activeHref === item.href;
              return (
                <li key={item.href} className="relative">
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200",
                      isActive
                        ? "bg-white/[0.1] text-white"
                        : "text-white/40 hover:text-white hover:bg-white/[0.04]"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId={`${config.role}-sidebar-indicator`}
                        className={cn(
                          "absolute left-0 w-1 h-7 bg-gradient-to-b rounded-r-full",
                          brand.indicatorGradient
                        )}
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                    <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-glass">
          <div className="flex items-center gap-3 mb-3">
            <div
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center",
                "bg-gradient-to-br",
                brand.bgGradient,
                "border",
                brand.borderClass
              )}
            >
              <span className="text-sm font-medium text-white">
                {(user?.name || brand.title.charAt(0)).charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.name || brand.subtitle}
              </p>
              <p className="text-xs text-white/40 truncate">
                {user?.email || user?.telegramUsername || config.role}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-2 rounded-xl",
              "text-white/40 hover:text-white hover:bg-white/[0.04]",
              "transition-all duration-200 text-sm"
            )}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Выйти
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div
        className={cn(
          "lg:hidden fixed top-0 left-0 right-0 z-50",
          "bg-gradient-to-b from-primary/95 to-primary/80",
          "backdrop-blur-xl border-b border-glass"
        )}
      >
        <div className="flex items-center justify-between px-4 h-14">
          <Link
            href={config.sidebarItems[0]?.href || config.basePath}
            className="flex items-center gap-2"
          >
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                "bg-gradient-to-br",
                brand.bgGradient,
                "border",
                brand.borderClass
              )}
            >
              <span className={cn("w-4 h-4 flex items-center justify-center", brand.accentClass)}>
                {brand.logoIcon}
              </span>
            </div>
            <span className="font-semibold text-white text-sm">{brand.title}</span>
          </Link>
          <div className="flex items-center gap-2">
            {searchEnabled && (
              <button
                onClick={() => {
                  setShowSearch(!showSearch);
                  setShowNotifications(false);
                }}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                  showSearch ? "bg-white/[0.12]" : "hover:bg-white/[0.06]"
                )}
                aria-label="Поиск"
              >
                <svg
                  className="w-4 h-4 text-white/60"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </button>
            )}
            {notificationsEnabled && config.useNotifications && (
              <NotificationBell
                useNotificationsHook={config.useNotifications}
                isOpen={showNotifications}
                onToggle={() => {
                  setShowNotifications(!showNotifications);
                  setShowSearch(false);
                }}
              />
            )}
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center",
                "bg-gradient-to-br",
                brand.bgGradient,
                "border",
                brand.borderClass
              )}
            >
              <span className="text-xs font-medium text-white">
                {(user?.name || brand.title.charAt(0)).charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Search Panel */}
      <AnimatePresence>
        {showSearch && searchEnabled && config.endpoints.search && (
          <GlobalSearchPanel
            searchEndpoint={config.endpoints.search}
            basePath={config.basePath}
            onClose={() => setShowSearch(false)}
          />
        )}
      </AnimatePresence>

      {/* Notification Panel */}
      <AnimatePresence>
        {showNotifications && notificationsEnabled && config.useNotifications && (
          <NotificationPanel
            useNotificationsHook={config.useNotifications}
            onClose={() => setShowNotifications(false)}
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 min-w-0 lg:ml-64 pt-14 lg:pt-0 pb-24 lg:pb-6">
        {isNavigating ? (
          <div className="flex items-center justify-center h-[calc(100dvh-64px)]">
            <Spinner size="lg" />
          </div>
        ) : (
          children
        )}
      </main>

      {/* Mobile Bottom Nav */}
      <BottomNav
        items={config.mobileNavItems}
        activeHref={activeHref}
        className="md:flex lg:hidden"
      />
    </div>
  );
}
