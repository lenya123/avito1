"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

interface SizeChartProps {
  sizes: Record<string, number>;
  className?: string;
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL"];

function getSortedSizes(sizes: Record<string, number>): [string, number][] {
  return Object.entries(sizes).sort(([a], [b]) => {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function SizeChart({ sizes, className }: SizeChartProps) {
  const entries = getSortedSizes(sizes);
  if (entries.length === 0) return null;

  const maxCount = Math.max(...entries.map(([, c]) => c));
  const totalCount = entries.reduce((sum, [, c]) => sum + c, 0);

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card",
        className
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative p-6">
        <h3 className="text-lg font-semibold text-white mb-5">Распределение размеров</h3>

        <div className="space-y-2.5">
          {entries.map(([size, count], i) => {
            const percent = Math.round((count / totalCount) * 100);
            const barWidth = (count / maxCount) * 100;

            return (
              <div key={size} className="flex items-center gap-3">
                <span className="text-sm font-medium text-white/60 w-8 shrink-0">{size}</span>
                <div className="flex-1 h-5 rounded-md bg-white/[0.04] overflow-hidden">
                  <motion.div
                    className="h-full rounded-md"
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{
                      duration: 0.5,
                      ease: "easeOut",
                      delay: 0.05 * i,
                    }}
                    style={{
                      background:
                        "linear-gradient(to right, rgba(10,132,255,0.6), rgba(10,132,255,0.3))",
                    }}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-white/60 w-6 text-right">{count}</span>
                  <span className="text-xs text-white/20 w-8 text-right">{percent}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SizeChartSkeleton() {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass",
        "shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6">
        <div className="h-6 w-44 bg-white/10 rounded mb-5" />
        <div className="space-y-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-8 bg-white/10 rounded shrink-0" />
              <div
                className="flex-1 h-5 bg-white/[0.06] rounded-md"
                style={{ maxWidth: `${100 - i * 15}%` }}
              />
              <div className="h-3 w-14 bg-white/10 rounded shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
