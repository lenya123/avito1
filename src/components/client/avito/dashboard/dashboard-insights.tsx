"use client";

import { useMemo } from "react";
import { useAvitoOverview, useAvitoReviews } from "@/hooks/use-avito";
import { generateAvitoInsights } from "@/lib/avito/insights-engine";
import { InsightCard } from "@/components/client/analytics/insight-card";

export function DashboardInsights() {
  const { data: overview } = useAvitoOverview();
  const { data: reviewsData } = useAvitoReviews(0, 10);

  const insights = useMemo(() => {
    if (!overview) return [];

    const reviews = reviewsData?.reviews?.reviews ?? [];
    const unansweredReviews = reviews.filter((r) => !r.answer).length;

    return generateAvitoInsights({
      stats: overview.stats,
      unansweredReviews,
    });
  }, [overview, reviewsData]);

  if (insights.length === 0) return null;

  return (
    <div className="space-y-2">
      {insights.map((insight, index) => (
        <InsightCard
          key={insight.type}
          type={insight.type}
          severity={insight.severity}
          title={insight.title}
          body={insight.body}
          index={index}
        />
      ))}
    </div>
  );
}
