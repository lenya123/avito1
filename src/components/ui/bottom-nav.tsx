"use client";

import { type ReactNode, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/utils/cn";
import { useNavigationStore } from "@/stores/navigation-store";

export interface BottomNavItem {
  href: string;
  icon: ReactNode;
  label: string;
  badge?: number;
  /** CSS color for active state glow (e.g., "rgba(10,132,255,0.8)"). Defaults to blue. */
  activeGlow?: string;
  /** Tailwind text color class for active icon/label (e.g., "text-accent-green"). Defaults to "text-white". */
  activeColor?: string;
}

export interface BottomNavProps {
  items: BottomNavItem[];
  activeHref?: string;
  className?: string;
  /** Show on all screen sizes (default: hidden on md+) */
  alwaysVisible?: boolean;
}

export function BottomNav({ items, activeHref, className, alwaysVisible = false }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const linksRef = useRef<Map<string, HTMLAnchorElement>>(new Map());

  // Zustand store для мгновенной навигации
  const { targetHref, startNavigation, endNavigation } = useNavigationStore();

  // Сброс при смене страницы
  useEffect(() => {
    endNavigation();
  }, [pathname, endNavigation]);

  // Обработчик навигации — мгновенно показывает лоадер
  const handleNavigation = useCallback(
    (href: string, e?: React.MouseEvent | React.TouchEvent) => {
      if (href === pathname) return;

      // Предотвращаем стандартное поведение Link
      e?.preventDefault();

      // Мгновенно устанавливаем targetHref — лоадер появится сразу
      startNavigation(href);

      // Запускаем навигацию
      router.push(href);
    },
    [pathname, startNavigation, router]
  );

  const displayActiveHref = targetHref ?? activeHref;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2",
        !alwaysVisible && "md:hidden",
        className
      )}
    >
      <nav
        aria-label="Основная навигация"
        className={cn(
          "relative",
          "bg-gradient-to-b from-white/[0.12] to-white/[0.06]",
          "backdrop-blur-xl [-webkit-backdrop-filter:blur(24px)]",
          "border border-glass-active",
          "rounded-2xl",
          "shadow-[0_8px_32px_rgba(0,0,0,0.4),0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15),inset_0_-1px_0_rgba(0,0,0,0.15)]"
        )}
      >
        <div className="flex items-center justify-around h-14 px-1">
          {items.map((item) => {
            const isActive = displayActiveHref === item.href;
            const isNavigating = targetHref === item.href && pathname !== item.href;

            return (
              <div
                key={item.href}
                className={cn(
                  "relative flex flex-col items-center justify-center",
                  "flex-1 h-full",
                  "active:scale-95",
                  "transition-transform duration-100",
                  "touch-action-manipulation select-none"
                )}
              >
                <Link
                  ref={(el) => {
                    if (el) linksRef.current.set(item.href, el);
                  }}
                  href={item.href}
                  prefetch={true}
                  onClick={(e) => handleNavigation(item.href, e)}
                  onTouchEnd={(e) => handleNavigation(item.href, e)}
                  className={cn(
                    "absolute inset-0",
                    "flex flex-col items-center justify-center gap-0.5",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-inset rounded-xl",
                    "-webkit-tap-highlight-color-transparent"
                  )}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  {/* Icon container with glow effect */}
                  <div className="relative pointer-events-none">
                    <div
                      className={cn(
                        "w-6 h-6 transition-all duration-200",
                        isActive
                          ? [item.activeColor || "text-white", "scale-110"]
                          : "text-white/40 scale-100",
                        isNavigating && "animate-pulse"
                      )}
                    >
                      {item.icon}
                    </div>
                    {/* Glow behind active icon */}
                    {isActive && (
                      <div
                        className="absolute inset-0 blur-md opacity-60 pointer-events-none"
                        style={{
                          background: `radial-gradient(circle, ${item.activeGlow || "rgba(10,132,255,0.8)"} 0%, transparent 70%)`,
                        }}
                      />
                    )}
                    {/* Badge */}
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={cn(
                          "absolute -top-1.5 -right-2",
                          "min-w-[16px] h-[16px] px-1",
                          "flex items-center justify-center",
                          "bg-accent-red text-white",
                          "text-2xs font-bold rounded-full",
                          "shadow-[0_2px_8px_rgba(255,69,58,0.5)]"
                        )}
                      >
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </div>
                  {/* Label */}
                  <span
                    className={cn(
                      "text-2xs font-medium pointer-events-none transition-colors duration-200",
                      isActive ? item.activeColor || "text-white" : "text-white/40"
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// Common icons for navigation
export const NavIcons = {
  home: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  ),
  catalog: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
  ),
  orders: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  ),
  stats: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  ),
  education: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  ),
  support: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  ),
  profile: (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  ),
};
