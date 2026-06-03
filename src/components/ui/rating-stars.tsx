"use client";

import { cn } from "@/utils/cn";

export interface RatingStarsProps {
  /** 0..5 */
  value: number;
  size?: "sm" | "md";
  className?: string;
}

export function RatingStars({ value, size = "sm", className }: RatingStarsProps) {
  const clamped = Math.max(0, Math.min(5, value));
  const px = size === "sm" ? 14 : 18;
  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`Рейтинг ${clamped.toFixed(1)} из 5`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, clamped - i));
        return (
          <svg
            key={i}
            width={px}
            height={px}
            viewBox="0 0 24 24"
            className="shrink-0"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`rs-${i}-${fill}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset={`${fill * 100}%`} stopColor="#facc15" />
                <stop offset={`${fill * 100}%`} stopColor="rgba(255,255,255,0.18)" />
              </linearGradient>
            </defs>
            <path
              d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.6l-5.9 3.1 1.13-6.58L2.45 9.44l6.6-.96L12 2.5z"
              fill={`url(#rs-${i}-${fill})`}
            />
          </svg>
        );
      })}
    </div>
  );
}
