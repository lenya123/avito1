"use client";

import { useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";

interface UseNavClickOptions {
  /** Время debounce в ms (по умолчанию 50) */
  debounceMs?: number;
  /** Callback после начала навигации */
  onNavigate?: (href: string) => void;
}

/**
 * Хук для надёжной навигации на iOS Safari.
 * Решает проблему "проглатывания" быстрых кликов.
 *
 * @example
 * const { getNavProps, isPending } = useNavClick();
 *
 * <button {...getNavProps("/catalog")}>Каталог</button>
 */
export function useNavClick(options: UseNavClickOptions = {}) {
  const { debounceMs = 50, onNavigate } = options;

  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const lastNavRef = useRef<{ href: string; time: number } | null>(null);

  const navigate = useCallback(
    (href: string) => {
      if (href === pathname) return;

      const now = Date.now();

      // Защита от двойной обработки (touch + click)
      if (
        lastNavRef.current &&
        lastNavRef.current.href === href &&
        now - lastNavRef.current.time < debounceMs
      ) {
        return;
      }

      lastNavRef.current = { href, time: now };
      onNavigate?.(href);

      startTransition(() => {
        router.push(href);
      });
    },
    [pathname, router, startTransition, debounceMs, onNavigate]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent, href: string) => {
      e.preventDefault();
      navigate(href);
    },
    [navigate]
  );

  const handleClick = useCallback(
    (href: string) => {
      navigate(href);
    },
    [navigate]
  );

  /**
   * Возвращает props для элемента навигации
   */
  const getNavProps = useCallback(
    (href: string) => ({
      onTouchEnd: (e: React.TouchEvent) => handleTouchEnd(e, href),
      onClick: () => handleClick(href),
    }),
    [handleTouchEnd, handleClick]
  );

  return {
    /** Props для привязки к элементу: { onTouchEnd, onClick } */
    getNavProps,
    /** Идёт ли навигация */
    isPending,
    /** Текущий pathname */
    pathname,
    /** Функция навигации напрямую */
    navigate,
  };
}
