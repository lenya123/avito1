"use client";

import { useAvitoOverview } from "@/hooks/use-avito";
import { ConversionFunnel } from "@/components/client/avito/conversion-funnel";

export function DashboardFunnel() {
  const { data: overview } = useAvitoOverview();

  if (!overview || overview.stats.totalViews === 0) return null;

  return (
    <ConversionFunnel
      views={overview.stats.totalViews}
      favorites={overview.stats.totalFavorites}
      contacts={overview.stats.totalContacts}
    />
  );
}
