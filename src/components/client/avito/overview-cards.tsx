"use client";

import { StatsCard, StatsCardSkeleton } from "@/components/client";

export interface OverviewStats {
  adBalance: number | null;
  avgPromoPerDay: number;
  activeItems: number;
  viewsMonth: number;
  favoritesMonth: number;
  contactsMonth: number;
  ordersMonth: number;
  viewsToday: number;
  contactsToday: number;
  rating: { score: number; total_reviews: number } | null;
}

interface AvitoOverviewCardsProps {
  stats: OverviewStats;
  isLoading?: boolean;
}

const money = (v: number | null) =>
  v == null ? "—" : `${Math.round(v).toLocaleString("ru")} ₽`;

const todaySubtitle = (n: number) => (n > 0 ? `+${n.toLocaleString("ru")} сегодня` : undefined);

export function AvitoOverviewCards({ stats, isLoading }: AvitoOverviewCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <StatsCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* 1. Баланс (аванс — для объявлений, не для покупок) */}
      <StatsCard
        title="Баланс (аванс)"
        value={money(stats.adBalance)}
        color="green"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
      />
      {/* 2. Ср. расход на продвижение/день (за последнюю неделю) */}
      <StatsCard
        title="Расход/день"
        value={money(stats.avgPromoPerDay)}
        subtitle="продвижение, нед."
        color="orange"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        }
      />
      {/* 3. Активные объявления */}
      <StatsCard
        title="Активные объявы"
        value={stats.activeItems}
        color="blue"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        }
      />
      {/* 4. Просмотры (за месяц) */}
      <StatsCard
        title="Просмотры (мес)"
        value={stats.viewsMonth.toLocaleString("ru")}
        subtitle={todaySubtitle(stats.viewsToday)}
        color="green"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        }
      />
      {/* 5. Избранное (за месяц) */}
      <StatsCard
        title="Избранное (мес)"
        value={stats.favoritesMonth.toLocaleString("ru")}
        color="orange"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        }
      />
      {/* 6. Контакты / чаты (за месяц) */}
      <StatsCard
        title="Контакты (мес)"
        value={stats.contactsMonth.toLocaleString("ru")}
        subtitle={todaySubtitle(stats.contactsToday)}
        color="purple"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        }
      />
      {/* 7. Заказы (за месяц) */}
      <StatsCard
        title="Заказы (мес)"
        value={stats.ordersMonth.toLocaleString("ru")}
        color="blue"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        }
      />
      {/* 8. Рейтинг магазина */}
      <StatsCard
        title="Рейтинг"
        value={stats.rating ? stats.rating.score.toFixed(1) : "—"}
        subtitle={stats.rating ? `${stats.rating.total_reviews} отзывов` : undefined}
        color="orange"
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        }
      />
    </div>
  );
}
