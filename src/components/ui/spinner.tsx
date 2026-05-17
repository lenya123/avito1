"use client";

import { cn } from "@/utils/cn";

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

const dotSizeStyles: Record<SpinnerSize, { dot: string; gap: string; blur: string }> = {
  xs: { dot: "w-1 h-1", gap: "gap-0.5", blur: "blur-[1px]" },
  sm: { dot: "w-1.5 h-1.5", gap: "gap-1", blur: "blur-[2px]" },
  md: { dot: "w-2 h-2", gap: "gap-1.5", blur: "blur-[3px]" },
  lg: { dot: "w-2.5 h-2.5", gap: "gap-2", blur: "blur-[4px]" },
  xl: { dot: "w-3 h-3", gap: "gap-2.5", blur: "blur-[5px]" },
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  const styles = dotSizeStyles[size];

  return (
    <div
      className={cn("flex items-center", styles.gap, className)}
      role="status"
      aria-label="Загрузка"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="relative">
          {/* Glow layer */}
          <div
            className={cn(
              "absolute inset-[-2px] rounded-full",
              "bg-white/40",
              styles.blur,
              "animate-breathing-glow"
            )}
            style={{ animationDelay: `${i * 0.2}s` }}
          />
          {/* Glass dot */}
          <div
            className={cn(
              styles.dot,
              "relative rounded-full",
              "bg-white/80",
              "border border-glass-strong",
              "shadow-[0_0_8px_rgba(255,255,255,0.3)]",
              "animate-breathing"
            )}
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        </div>
      ))}
      <span className="sr-only">Загрузка...</span>
    </div>
  );
}

export interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  className?: string;
}

export function LoadingOverlay({ visible, message, className }: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-50",
        "flex flex-col items-center justify-center gap-3",
        "bg-primary/80 backdrop-blur-sm",
        "rounded-glass",
        className
      )}
    >
      <Spinner size="lg" />
      {message && <p className="text-sm text-white/60">{message}</p>}
    </div>
  );
}

export interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, variant = "text", width, height }: SkeletonProps) {
  const style: React.CSSProperties = {
    width: width,
    height: height,
  };

  return (
    <div
      className={cn(
        "animate-pulse bg-gradient-to-r from-white/5 via-white/10 to-white/5",
        "bg-[length:200%_100%]",
        variant === "text" && "h-4 rounded",
        variant === "circular" && "rounded-full",
        variant === "rectangular" && "rounded-lg",
        className
      )}
      style={style}
      aria-hidden="true"
    />
  );
}
