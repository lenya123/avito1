"use client";

import { cn } from "@/utils/cn";
import { Card, Skeleton } from "@/components/ui";
import { MiniSparkline } from "@/components/shared/analytics/mini-sparkline";

interface KpiCardProps {
  title: string;
  value: string;
  change?: number;
  sparkline?: number[];
  color: string;
}

export function KpiCard({ title, value, change, sparkline, color }: KpiCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <Card>
      <div className="p-4">
        <p className="text-sm text-white/60 mb-1">{title}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
        {change !== undefined && (
          <div className="flex items-center gap-1 mt-1">
            <span
              className={cn(
                "text-sm font-medium",
                isPositive ? "text-accent-green" : "text-accent-red"
              )}
            >
              {isPositive ? "+" : ""}
              {change}%
            </span>
            <svg
              className={cn("w-3.5 h-3.5", isPositive ? "text-accent-green" : "text-accent-red")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={isPositive ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"}
              />
            </svg>
            <span className="text-2xs text-white/30">vs вчера</span>
          </div>
        )}
        {sparkline && sparkline.length >= 2 && (
          <div className="mt-2 -mx-1">
            <MiniSparkline data={sparkline} color={color} width={80} height={24} />
          </div>
        )}
      </div>
    </Card>
  );
}

export function KpiCardSkeleton() {
  return (
    <Card>
      <div className="p-4 animate-pulse">
        <Skeleton className="h-4 w-16 mb-2" />
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-4 w-20 mb-2" />
        <Skeleton className="h-6 w-full mt-2" />
      </div>
    </Card>
  );
}
