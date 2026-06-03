"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useNavigationStore } from "@/stores/navigation-store";
import { Header, NavLink, UserMenu, BottomNav, NavIcons, Spinner } from "@/components/ui";

const navItems = [
  { href: "/catalog", icon: NavIcons.catalog, label: "Каталог" },
  { href: "/stats", icon: NavIcons.stats, label: "Заказы" },
  { href: "/education", icon: NavIcons.education, label: "Обучение" },
  { href: "/support", icon: NavIcons.support, label: "Помощь" },
  { href: "/profile", icon: NavIcons.profile, label: "Профиль" },
];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout, isInitialized } = useAuth();
  const targetHref = useNavigationStore((state) => state.targetHref);

  // Показываем лоадер если идёт навигация на другую страницу
  const isNavigating = targetHref !== null && targetHref !== pathname;

  // Определяем активную страницу по pathname
  const activeHref = useMemo(() => {
    if (pathname.startsWith("/catalog")) return "/catalog";
    if (pathname.startsWith("/stats")) return "/stats";
    if (pathname.startsWith("/education")) return "/education";
    if (pathname.startsWith("/support")) return "/support";
    if (pathname.startsWith("/profile")) return "/profile";
    if (pathname.startsWith("/avito")) return "/profile"; // Avito — подраздел профиля
    if (pathname.startsWith("/order/")) return "/catalog"; // Страница заказа относится к каталогу
    return "/catalog";
  }, [pathname]);

  // Пока авторизация не инициализирована — показываем layout со спиннером
  if (!isInitialized) {
    return (
      <div className="min-h-dvh bg-primary">
        {/* Header только на desktop */}
        <Header />

        {/* Спиннер по центру: на мобиле между верхом и BottomNav (64px), на desktop минус Header (64px) */}
        <main className="flex items-center justify-center h-[calc(100dvh-64px)]">
          <Spinner size="lg" />
        </main>

        <BottomNav items={navItems} activeHref={activeHref} />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-primary pb-24 md:pb-6">
      {/* Header — общий для всех страниц */}
      <Header
        logoHref="/catalog"
        rightContent={
          <UserMenu
            name={user?.name || user?.telegramUsername || "Клиент"}
            balance={(user?.deposit || 0) + (user?.referralDeposit || 0)}
            onLogout={logout}
          />
        }
      >
        <NavLink href="/catalog" active={activeHref === "/catalog"}>
          Каталог
        </NavLink>
        <NavLink href="/stats" active={activeHref === "/stats"}>
          Заказы
        </NavLink>
        <NavLink href="/education" active={activeHref === "/education"}>
          Обучение
        </NavLink>
        <NavLink href="/support" active={activeHref === "/support"}>
          Помощь
        </NavLink>
        <NavLink href="/profile" active={activeHref === "/profile"}>
          Профиль
        </NavLink>
      </Header>

      {/* Контент страницы или лоадер при навигации */}
      {isNavigating ? (
        <main className="flex items-center justify-center h-[calc(100dvh-64px)]">
          <Spinner size="lg" />
        </main>
      ) : (
        children
      )}

      {/* Bottom navigation — общая для всех страниц */}
      <BottomNav items={navItems} activeHref={activeHref} />
    </div>
  );
}
