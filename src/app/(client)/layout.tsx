"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useNavigationStore } from "@/stores/navigation-store";
import { Header, NavLink, UserMenu, BottomNav, NavIcons, Spinner } from "@/components/ui";

// Standalone-навигация оператора (один оператор, N магазинов Avito).
const navItems = [
  { href: "/avito", icon: NavIcons.stats, label: "Дашборд" },
  { href: "/avito/items", icon: NavIcons.catalog, label: "Объявления" },
  { href: "/avito/create", icon: NavIcons.create, label: "Создать" },
  { href: "/avito/chats", icon: NavIcons.support, label: "Чаты" },
  { href: "/avito/settings", icon: NavIcons.settings, label: "Ещё" },
];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout, isInitialized } = useAuth();
  const targetHref = useNavigationStore((state) => state.targetHref);

  const isNavigating = targetHref !== null && targetHref !== pathname;

  const activeHref = useMemo(() => {
    if (pathname === "/avito" || pathname === "/avito/operations" || pathname === "/avito/reviews")
      return "/avito";
    if (pathname.startsWith("/avito/items")) return "/avito/items";
    if (pathname.startsWith("/avito/create")) return "/avito/create";
    if (pathname.startsWith("/avito/chats")) return "/avito/chats";
    if (pathname.startsWith("/avito/settings")) return "/avito/settings";
    if (pathname.startsWith("/avito")) return "/avito";
    return "/avito";
  }, [pathname]);

  if (!isInitialized) {
    return (
      <div className="min-h-dvh bg-primary">
        <Header />
        <main className="flex items-center justify-center h-[calc(100dvh-64px)]">
          <Spinner size="lg" />
        </main>
        <BottomNav items={navItems} activeHref={activeHref} />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-primary pb-24 md:pb-6">
      <Header
        logoHref="/avito"
        rightContent={
          <UserMenu name={user?.name || "Оператор"} balance={0} onLogout={logout} />
        }
      >
        <NavLink href="/avito" active={activeHref === "/avito"}>
          Дашборд
        </NavLink>
        <NavLink href="/avito/items" active={activeHref === "/avito/items"}>
          Объявления
        </NavLink>
        <NavLink href="/avito/create" active={activeHref === "/avito/create"}>
          Создать
        </NavLink>
        <NavLink href="/avito/chats" active={activeHref === "/avito/chats"}>
          Чаты
        </NavLink>
        <NavLink href="/avito/settings" active={activeHref === "/avito/settings"}>
          Ещё
        </NavLink>
      </Header>

      {isNavigating ? (
        <main className="flex items-center justify-center h-[calc(100dvh-64px)]">
          <Spinner size="lg" />
        </main>
      ) : (
        children
      )}

      <BottomNav items={navItems} activeHref={activeHref} />
    </div>
  );
}
