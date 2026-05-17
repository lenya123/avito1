"use client";

import { useRef, useLayoutEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

export type StatsCardColor = "neutral" | "blue" | "green" | "orange" | "purple";

export interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
    /** Invert colors: up=red, down=green (for metrics where lower is better, e.g. returns) */
    invertColor?: boolean;
  };
  icon?: React.ReactNode;
  color?: StatsCardColor;
  className?: string;
}

// Цветовые схемы для иконок
const COLOR_STYLES: Record<
  StatsCardColor,
  { bg: string; border: string; shadow: string; text: string }
> = {
  neutral: {
    bg: "bg-gradient-to-br from-white/[0.12] to-white/[0.06]",
    border: "border-glass",
    shadow: "shadow-[0_0_12px_rgba(255,255,255,0.05),inset_0_1px_0_rgba(255,255,255,0.1)]",
    text: "text-white/60",
  },
  blue: {
    bg: "bg-gradient-to-br from-accent-blue/20 to-accent-blue/10",
    border: "border-accent-blue/25",
    shadow: "shadow-[0_0_12px_rgba(10,132,255,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]",
    text: "text-accent-blue",
  },
  green: {
    bg: "bg-gradient-to-br from-accent-green/20 to-accent-green/10",
    border: "border-accent-green/25",
    shadow: "shadow-[0_0_12px_rgba(48,209,88,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]",
    text: "text-accent-green",
  },
  orange: {
    bg: "bg-gradient-to-br from-accent-orange/20 to-accent-orange/10",
    border: "border-accent-orange/25",
    shadow: "shadow-[0_0_12px_rgba(255,159,10,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]",
    text: "text-accent-orange",
  },
  purple: {
    bg: "bg-gradient-to-br from-accent-purple/20 to-accent-purple/10",
    border: "border-accent-purple/25",
    shadow: "shadow-[0_0_12px_rgba(191,90,242,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]",
    text: "text-accent-purple",
  },
};

export function StatsCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  color = "neutral",
  className,
}: StatsCardProps) {
  const colorStyle = COLOR_STYLES[color];
  const valueRef = useRef<HTMLParagraphElement>(null);
  const valueStr = String(value);

  // Auto-fit: уменьшаем font-size и синхронизируем между карточками в одной сетке
  useLayoutEffect(() => {
    const el = valueRef.current;
    if (!el) return;
    // Сброс к базовому размеру из CSS-класса
    el.style.fontSize = "";
    // Вычисляем нужный размер для этой карточки
    let fitSize = parseFloat(getComputedStyle(el).fontSize);
    if (el.scrollWidth > el.clientWidth) {
      const ratio = el.clientWidth / el.scrollWidth;
      fitSize = Math.max(14, Math.floor(fitSize * ratio));
    }
    el.dataset.fitSize = String(fitSize);
    // Синхронизируем все карточки в той же .grid — последняя карточка
    // выставит правильный минимум для всех (эффекты идут по порядку)
    const grid = el.closest(".grid");
    if (grid) {
      const allValues = grid.querySelectorAll<HTMLElement>("[data-fit-size]");
      let minSize = Infinity;
      allValues.forEach((v) => {
        const s = Number(v.dataset.fitSize);
        if (s > 0) minSize = Math.min(minSize, s);
      });
      if (minSize < Infinity) {
        allValues.forEach((v) => {
          v.style.fontSize = `${minSize}px`;
        });
      }
    } else {
      el.style.fontSize = `${fitSize}px`;
    }
  }, [valueStr]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative p-4 rounded-2xl overflow-hidden",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        className
      )}
    >
      {/* Декоративный блик */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="flex items-start justify-between gap-2 relative">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/60 font-medium">{title}</p>
          <p
            ref={valueRef}
            className="text-2xl font-bold text-white mt-1 whitespace-nowrap overflow-hidden"
          >
            {value}
          </p>
          {/* Всегда резервируем место под subtitle для одинаковой высоты */}
          <p className={cn("text-xs mt-1 h-4", subtitle ? "text-white/40" : "invisible")}>
            {subtitle || "\u00A0"}
          </p>
          {trend &&
            (() => {
              const isGood = trend.invertColor ? !trend.isPositive : trend.isPositive;
              return (
                <div
                  className={cn(
                    "inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-medium",
                    isGood
                      ? "bg-accent-green/20 text-accent-green"
                      : "bg-accent-red/20 text-accent-red"
                  )}
                >
                  <svg
                    className={cn("w-3 h-3", !trend.isPositive && "rotate-180")}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 10l7-7m0 0l7 7m-7-7v18"
                    />
                  </svg>
                  {trend.isPositive ? "+" : ""}
                  {trend.value}%
                </div>
              );
            })()}
        </div>
        {icon && (
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center border",
              colorStyle.bg,
              colorStyle.border,
              colorStyle.shadow,
              colorStyle.text
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Skeleton
export function StatsCardSkeleton() {
  return (
    <div
      className={cn(
        "relative p-4 rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass",
        "shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-4 w-16 bg-white/10 rounded" />
          <div className="h-7 w-24 bg-white/10 rounded mt-1" />
          <div className="h-4 w-20 bg-white/10 rounded mt-1" />
        </div>
        <div className="w-10 h-10 rounded-xl bg-white/10" />
      </div>
    </div>
  );
}
