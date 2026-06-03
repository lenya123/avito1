"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNavigationStore } from "@/stores/navigation-store";
import { useShipperAuthStore, useShipperUser } from "@/stores/shipper-auth-store";
import { Toaster } from "sonner";
import { Header, NavLink, UserMenu, BottomNav, Spinner } from "@/components/ui";
import { ShipperNavIcons } from "@/components/shipper/nav-icons";

import { useShipperRealtimeSubscription } from "@/hooks/use-shipper-realtime";

const navItems = [
  {
    href: "/shipper",
    icon: <ShipperNavIcons.orders />,
    label: "Заказы",
    activeColor: "text-[#0a84ff]",
    activeGlow: "rgba(10,132,255,0.8)",
  },
  {
    href: "/shipper/stock",
    icon: <ShipperNavIcons.stock />,
    label: "Склад",
    activeColor: "text-[#64d2ff]",
    activeGlow: "rgba(100,210,255,0.7)",
  },
  {
    href: "/shipper/earnings",
    icon: <ShipperNavIcons.earnings />,
    label: "Деньги",
    activeColor: "text-[#30d158]",
    activeGlow: "rgba(48,209,88,0.7)",
  },
  {
    href: "/shipper/profile",
    icon: <ShipperNavIcons.profile />,
    label: "Я",
    activeColor: "text-[#bf5af2]",
    activeGlow: "rgba(191,90,242,0.7)",
  },
];

export default function ShipperLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const targetHref = useNavigationStore((state) => state.targetHref);
  const user = useShipperUser();
  const { logout } = useShipperAuthStore();

  useShipperRealtimeSubscription();

  const isLoginPage = pathname === "/shipper/login";
  const isNavigating = targetHref !== null && targetHref !== pathname;

  const activeHref = useMemo(() => {
    if (pathname.startsWith("/shipper/stock")) return "/shipper/stock";
    if (pathname.startsWith("/shipper/earnings")) return "/shipper/earnings";
    if (pathname.startsWith("/shipper/profile")) return "/shipper/profile";
    return "/shipper";
  }, [pathname]);

  const handleLogout = async () => {
    await logout();
    router.replace("/shipper/login");
  };

  return (
    <div className="min-h-dvh bg-primary overflow-x-hidden">
      {/* Desktop Header */}
      {!isLoginPage && (
        <Header
          logoHref="/shipper"
          rightContent={<UserMenu name={user?.name || "Отправщик"} onLogout={handleLogout} />}
        >
          <NavLink href="/shipper" active={activeHref === "/shipper"}>
            Заказы
          </NavLink>
          <NavLink href="/shipper/stock" active={activeHref === "/shipper/stock"}>
            Склад
          </NavLink>
          <NavLink href="/shipper/earnings" active={activeHref === "/shipper/earnings"}>
            Деньги
          </NavLink>
          <NavLink href="/shipper/profile" active={activeHref === "/shipper/profile"}>
            Я
          </NavLink>
        </Header>
      )}

      <main className={isLoginPage ? "" : "pb-24 md:pb-6"}>
        {isLoginPage ? (
          children
        ) : isNavigating ? (
          <div className="flex items-center justify-center h-[calc(100dvh-64px)]">
            <Spinner size="lg" />
          </div>
        ) : (
          children
        )}
      </main>

      {/* Mobile Bottom Nav — hidden on md+ */}
      {!isLoginPage && <BottomNav items={navItems} activeHref={activeHref} />}

      <Toaster
        position="bottom-center"
        offset={140}
        toastOptions={{
          style: {
            background: "rgba(30,30,34,0.95)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#fff",
            backdropFilter: "blur(20px)",
            borderRadius: "16px",
            fontSize: "14px",
          },
        }}
      />
    </div>
  );
}
