"use client";

import { useAvitoOverview } from "@/hooks/use-avito";
import { AvitoOverviewCards } from "@/components/client/avito/overview-cards";
import { ErrorState } from "@/components/ui/empty";

export function DashboardOverview() {
  const { data: overview, isLoading, isError, refetch } = useAvitoOverview();

  if (isError) {
    return <ErrorState title="Ошибка" message="Не удалось загрузить обзор" onRetry={refetch} />;
  }

  const stats = overview ? { ...overview.stats, activeCount: overview.activeCount } : ({} as never);

  return <AvitoOverviewCards stats={stats} isLoading={isLoading || !overview} />;
}
