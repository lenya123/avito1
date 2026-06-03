"use client";

import { cn } from "@/utils/cn";
import { InsightCard } from "./insight-card";
interface OwnerInsightsProps {
  insights: Array<{
    type: string;
    severity: "positive" | "warning" | "info" | "celebration";
    title: string;
    body: string;
  }>;
}

export function OwnerInsights({ insights }: OwnerInsightsProps) {
  if (insights.length === 0) return null;

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Рекомендации</h3>
        <div className="space-y-2">
          {insights.map((insight, i) => (
            <div key={i} className="relative">
              <InsightCard
                type={insight.type}
                severity={insight.severity}
                title={insight.title}
                body={insight.body}
                index={i}
              />
              {insight.severity === "warning" && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent-orange animate-pulse" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OwnerInsightsSkeleton() {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-6">
        <div className="h-6 w-36 bg-white/10 rounded mb-4" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-glass-subtle"
            >
              <div className="w-8 h-8 bg-white/10 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 bg-white/10 rounded" />
                <div className="h-3 w-full bg-white/10 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
