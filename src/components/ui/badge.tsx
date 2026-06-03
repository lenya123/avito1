"use client";

import { type ReactNode } from "react";
import { cn } from "@/utils/cn";

export type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "purple";

export type BadgeSize = "sm" | "md" | "lg";

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-white/10 text-white/80 border-glass",
  success: "bg-accent-green/20 text-accent-green border-accent-green/30",
  warning: "bg-accent-orange/20 text-accent-orange border-accent-orange/30",
  error: "bg-accent-red/20 text-accent-red border-accent-red/30",
  info: "bg-accent-blue/20 text-accent-blue border-accent-blue/30",
  purple: "bg-accent-purple/20 text-accent-purple border-accent-purple/30",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-white/60",
  success: "bg-accent-green",
  warning: "bg-accent-orange",
  error: "bg-accent-red",
  info: "bg-accent-blue",
  purple: "bg-accent-purple",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-base",
};

export function Badge({
  variant = "default",
  size = "md",
  dot = false,
  pulse = false,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        "rounded-full border",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
                dotColors[variant]
              )}
            />
          )}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotColors[variant])} />
        </span>
      )}
      {children}
    </span>
  );
}

// Preset badges for common statuses
export function StatusBadge({
  status,
  className,
}: {
  status: "active" | "inactive" | "pending" | "completed" | "cancelled" | "error";
  className?: string;
}) {
  const config: Record<
    typeof status,
    { variant: BadgeVariant; label: string; dot?: boolean; pulse?: boolean }
  > = {
    active: { variant: "success", label: "Активен", dot: true, pulse: true },
    inactive: { variant: "default", label: "Неактивен", dot: true },
    pending: { variant: "warning", label: "В ожидании", dot: true, pulse: true },
    completed: { variant: "success", label: "Завершён" },
    cancelled: { variant: "error", label: "Отменён" },
    error: { variant: "error", label: "Ошибка", dot: true },
  };

  const { variant, label, dot, pulse } = config[status];

  return (
    <Badge variant={variant} dot={dot} pulse={pulse} className={className}>
      {label}
    </Badge>
  );
}
