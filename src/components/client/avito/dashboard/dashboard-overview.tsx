"use client";

import { useAvitoOverview } from "@/hooks/use-avito";
import { AvitoOverviewCards } from "@/components/client/avito/overview-cards";
import { ErrorState } from "@/components/ui/empty";

export function DashboardOverview() {
  const { data: overview, isLoading, isError, refetch } = useAvitoOverview();

  if (isError) {
    return <ErrorState title="Ошибка" message="Не удалось загрузить обзор" onRetry={refetch} />;
  }

  const s = overview?.stats;
  const stats = {
    adBalance: s?.adBalance ?? null,
    avgPromoPerDay: s?.avgPromoPerDay ?? 0,
    activeItems: s?.activeItems ?? 0,
    viewsMonth: s?.viewsMonth ?? 0,
    favoritesMonth: s?.favoritesMonth ?? 0,
    contactsMonth: s?.contactsMonth ?? 0,
    ordersMonth: s?.ordersMonth ?? 0,
    viewsToday: s?.viewsToday ?? 0,
    contactsToday: s?.contactsToday ?? 0,
    rating: s?.rating ?? null,
  };

  return <AvitoOverviewCards stats={stats} isLoading={isLoading || !overview} />;
}
