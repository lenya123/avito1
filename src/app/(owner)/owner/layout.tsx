"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useNavigationStore } from "@/stores/navigation-store";
import { useOwnerAuthStore, useOwnerUser } from "@/stores/owner-auth-store";
import { BottomNav, Spinner } from "@/components/ui";
import { OwnerNavIcons } from "@/components/owner/nav-icons";
import { cn } from "@/utils/cn";

const sidebarItems = [
  { href: "/owner/dashboard", icon: <OwnerNavIcons.dashboard />, label: "Dashboard" },
  { href: "/owner/orders", icon: <OwnerNavIcons.orders />, label: "Заказы" },
  { href: "/owner/products", icon: <OwnerNavIcons.products />, label: "Товары" },
  { href: "/owner/clients", icon: <OwnerNavIcons.clients />, label: "Клиенты" },
  { href: "/owner/analytics", icon: <OwnerNavIcons.analytics />, label: "Аналитика" },
  { href: "/owner/shippers", icon: <OwnerNavIcons.shippers />, label: "Отправщики" },
  { href: "/owner/proxies", icon: <OwnerNavIcons.proxies />, label: "Прокси" },
  { href: "/owner/settings", icon: <OwnerNavIcons.settings />, label: "Настройки" },
];

const mobileNavItems = [
  { href: "/owner/dashboard", icon: <OwnerNavIcons.dashboard />, label: "Dashboard" },
  { href: "/owner/orders", icon: <OwnerNavIcons.orders />, label: "Заказы" },
  { href: "/owner/products", icon: <OwnerNavIcons.products />, label: "Товары" },
  { href: "/owner/clients", icon: <OwnerNavIcons.clients />, label: "Клиенты" },
  { href: "/owner/more", icon: <OwnerNavIcons.more />, label: "Ещё" },
];

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const targetHref = useNavigationStore((state) => state.targetHref);
  const user = useOwnerUser();
  const { logout } = useOwnerAuthStore();

  const isLoginPage = pathname === "/owner/login";
  const isNavigating = targetHref !== null && targetHref !== pathname;

  const activeHref = useMemo(() => {
    if (pathname === "/owner" || pathname === "/owner/dashboard") return "/owner/dashboard";
    if (pathname.startsWith("/owner/orders")) return "/owner/orders";
    if (pathname.startsWith("/owner/products")) return "/owner/products";
    if (pathname.startsWith("/owner/clients")) return "/owner/clients";
    if (pathname.startsWith("/owner/analytics")) return "/owner/analytics";
    if (pathname.startsWith("/owner/shippers")) return "/owner/shippers";
    if (pathname.startsWith("/owner/proxies")) return "/owner/proxies";
    if (pathname.startsWith("/owner/settings")) return "/owner/settings";
    if (pathname.startsWith("/owner/more")) return "/owner/more";
    return "/owner/dashboard";
  }, [pathname]);

  const handleLogout = async () => {
    await logout();
    router.replace("/owner/login");
  };

  if (isLoginPage) {
    return <>{children}</>;
  }

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
          <Link href="/owner/dashboard" className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                "bg-gradient-to-br from-purple-500/20 to-pink-500/10",
                "border border-purple-500/25",
                "shadow-[0_0_16px_rgba(191,90,242,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]"
              )}
            >
              <svg
                className="w-5 h-5 text-accent-purple"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <div>
              <h1 className="font-semibold text-white">Avito Drop</h1>
              <p className="text-xs text-white/40">Управление</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto">
          <ul className="space-y-1">
            {sidebarItems.map((item) => {
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
                        layoutId="sidebar-indicator"
                        className="absolute left-0 w-1 h-7 bg-gradient-to-b from-accent-purple to-accent-pink rounded-r-full"
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
                "bg-gradient-to-br from-purple-500/20 to-purple-500/10",
                "border border-purple-500/25"
              )}
            >
              <span className="text-sm font-medium text-white">
                {(user?.name || "O").charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name || "Владелец"}</p>
              <p className="text-xs text-white/40 truncate">
                {user?.email || user?.telegramUsername || "owner"}
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
          <Link href="/owner/dashboard" className="flex items-center gap-2">
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center",
                "bg-gradient-to-br from-purple-500/20 to-pink-500/10",
                "border border-purple-500/25"
              )}
            >
              <svg
                className="w-4 h-4 text-accent-purple"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <span className="font-semibold text-white text-sm">Avito Drop</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/20 to-purple-500/10 border border-purple-500/25 flex items-center justify-center">
              <span className="text-xs font-medium text-white">
                {(user?.name || "O").charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0 pb-24 lg:pb-6">
        {isNavigating ? (
          <div className="flex items-center justify-center h-[calc(100dvh-64px)]">
            <Spinner size="lg" />
          </div>
        ) : (
          children
        )}
      </main>

      {/* Mobile Bottom Nav — visible up to lg (sidebar takes over at lg) */}
      <BottomNav items={mobileNavItems} activeHref={activeHref} className="md:flex lg:hidden" />
    </div>
  );
}
