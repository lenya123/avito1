"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth, useUserLevel } from "@/hooks/use-auth";
import { useOrders, type OrderStatus } from "@/hooks/use-orders";
import { useStats, type StatsParams } from "@/hooks/use-stats";
import { formatPrice } from "@/utils/pricing";
import { cn } from "@/utils/cn";
import {
  OrderCard,
  OrderCardSkeleton,
  OrderFilters,
  StatsCard,
  StatsCardSkeleton,
  SalesChart,
  SalesChartSkeleton,
  type OrderFilterState,
  type OrderData,
  type BarSelectionData,
} from "@/components/client";
import { Button, Empty } from "@/components/ui";

const defaultFilters: OrderFilterState = {
  status: "",
  dateFrom: "",
  dateTo: "",
  period: "all",
};

export default function StatsPage() {
  const router = useRouter();
  const { user } = useAuth();
  useUserLevel(); // Хук загружает уровень для UI
  const [filters, setFilters] = useState<OrderFilterState>(defaultFilters);
  const [page, setPage] = useState(1);
  const [barSelection, setBarSelection] = useState<BarSelectionData>(null);
  // Проверка premium для dashboard
  const isPremium = useMemo(
    () =>
      user?.isVibePlus ||
      user?.subscriptionTier === "premium" ||
      user?.subscriptionTier === "top_floor_boss",
    [user]
  );

  // Маппинг фильтров → параметры Stats API
  const statsParams: StatsParams = useMemo(() => {
    const params: StatsParams = {};
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.period === "day") params.granularity = "day";
    else if (filters.period === "week") params.granularity = "week";
    else if (filters.period === "month") params.granularity = "month";
    // "all" и "custom" — granularity не задаём, API определит автоматически
    return params;
  }, [filters.dateFrom, filters.dateTo, filters.period]);

  // Загрузка статистики (только для premium)
  const { data: statsData, isLoading: statsLoading } = useStats(statsParams, isPremium);

  // Данные для карточек: из выбранного бара или из summary
  const displayStats = useMemo(() => {
    if (!statsData) return null;
    if (barSelection) {
      const roi =
        barSelection.invested > 0
          ? Math.round((barSelection.profit / barSelection.invested) * 100)
          : 0;
      return {
        totalOrders: barSelection.orders,
        totalInvested: barSelection.invested,
        totalRevenue: barSelection.revenue,
        totalProfit: barSelection.profit,
        roi,
        inProgress: statsData.summary.inProgress,
      };
    }
    return statsData.summary;
  }, [statsData, barSelection]);

  // Фильтры заказов: если выбран бар — фильтруем по его дате
  const effectiveOrderFilters = useMemo(() => {
    if (barSelection) {
      return {
        status: filters.status as OrderStatus | undefined,
        dateFrom: barSelection.dateFrom,
        dateTo: barSelection.dateTo,
      };
    }
    return {
      status: filters.status as OrderStatus | undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
    };
  }, [filters.status, filters.dateFrom, filters.dateTo, barSelection]);

  // Загрузка заказов
  const {
    data: ordersData,
    isLoading: ordersLoading,
    error: ordersError,
    refetch,
  } = useOrders(effectiveOrderFilters, page);

  // Handlers
  const handleBarSelect = useCallback((selection: BarSelectionData) => {
    setBarSelection(selection);
    setPage(1);
  }, []);

  const handleFiltersChange = useCallback((newFilters: OrderFilterState) => {
    setFilters(newFilters);
    setBarSelection(null);
    setPage(1);
  }, []);

  const handleOrderClick = useCallback(
    (orderId: string) => {
      router.push(`/stats/${orderId}`);
    },
    [router]
  );

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Статистика (только для premium) */}
      {isPremium && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Статистика</h2>

          {/* Карточки статистики */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {statsLoading || !displayStats ? (
              <>
                <StatsCardSkeleton />
                <StatsCardSkeleton />
                <StatsCardSkeleton />
                <StatsCardSkeleton />
              </>
            ) : (
              <>
                {/* 1. Заказов */}
                <StatsCard
                  title="Заказов"
                  value={displayStats.totalOrders}
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                      />
                    </svg>
                  }
                />
                {/* 2. Вложено */}
                <StatsCard
                  title="Вложено"
                  value={formatPrice(displayStats.totalInvested)}
                  subtitle={
                    !barSelection && displayStats.inProgress.count > 0
                      ? `${displayStats.inProgress.count} в работе`
                      : undefined
                  }
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  }
                />
                {/* 3. Выручка */}
                <StatsCard
                  title="Выручка"
                  value={formatPrice(displayStats.totalRevenue)}
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  }
                />
                {/* 4. Прибыль (ROI) */}
                <StatsCard
                  title="Прибыль (ROI)"
                  value={`${displayStats.roi > 0 ? "+" : ""}${displayStats.roi}%`}
                  subtitle={formatPrice(displayStats.totalProfit)}
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                  }
                />
              </>
            )}
          </div>

          {/* График продаж */}
          {statsLoading ? (
            <SalesChartSkeleton />
          ) : statsData?.chartData ? (
            <SalesChart
              data={statsData.chartData}
              granularity={statsData.granularity}
              onBarSelect={handleBarSelect}
            />
          ) : null}

          {/* Кнопка аналитики */}
          <button
            onClick={() => router.push("/stats/analytics")}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3.5 rounded-xl mt-4",
              "bg-gradient-to-br from-accent-purple/15 to-accent-purple/5",
              "border border-accent-purple/20",
              "hover:border-accent-purple/35 hover:from-accent-purple/20",
              "transition-all duration-200",
              "shadow-[0_4px_16px_rgba(191,90,242,0.1)]"
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center",
                  "bg-gradient-to-br from-accent-purple/25 to-accent-purple/15",
                  "border border-accent-purple/30"
                )}
              >
                <span className="text-lg">🧠</span>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">Подробная аналитика</p>
                <p className="text-xs text-white/40">Health Score, инсайты, воронка</p>
              </div>
            </div>
            <svg
              className="w-5 h-5 text-white/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </motion.div>
      )}

      {/* Баннер для не-premium */}
      {!isPremium && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={cn(
            "mb-6 p-4 rounded-2xl overflow-hidden relative",
            "bg-gradient-to-br from-accent-blue/15 to-accent-blue/8",
            "border border-accent-blue/20",
            "shadow-[0_4px_24px_rgba(10,132,255,0.15),inset_0_1px_0_rgba(255,255,255,0.08)]"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent-blue/30 to-transparent" />
          <div className="flex items-center gap-4 relative">
            <div
              className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center",
                "bg-gradient-to-br from-accent-blue/25 to-accent-blue/15",
                "border border-accent-blue/30",
                "shadow-glass-inset"
              )}
            >
              <span className="text-2xl">📊</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white">Расширенная статистика</h3>
              <p className="text-xs text-white/60 mt-0.5">
                Графики, аналитика и гонка продаж — в Premium тарифе
              </p>
            </div>
            <Button size="sm" onClick={() => router.push("/profile/subscription")}>
              Подробнее
            </Button>
          </div>
        </motion.div>
      )}

      {/* Фильтры */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <OrderFilters filters={filters} onChange={handleFiltersChange} className="mb-4" />
      </motion.div>

      {/* Секция заказов */}
      <h2 className="text-lg font-semibold text-white mb-4">Заказы</h2>
      <div className="space-y-3">
        {ordersLoading ? (
          <>
            <OrderCardSkeleton />
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </>
        ) : ordersError ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "text-center py-12 rounded-2xl",
              "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
              "border border-glass"
            )}
          >
            <div className="text-4xl mb-3">😔</div>
            <p className="text-white/60 mb-4">Ошибка загрузки заказов</p>
            <Button variant="secondary" onClick={() => refetch()}>
              Повторить
            </Button>
          </motion.div>
        ) : ordersData?.orders.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Empty
              icon="📦"
              title="Заказов пока нет"
              description="Оформите первый заказ в каталоге"
              action={<Button onClick={() => router.push("/catalog")}>В каталог</Button>}
            />
          </motion.div>
        ) : (
          <>
            {ordersData?.orders.map((order: OrderData, index: number) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.03 }}
              >
                <OrderCard order={order} onClick={handleOrderClick} />
              </motion.div>
            ))}

            {/* Пагинация */}
            {ordersData && ordersData.pagination.totalPages > 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className={cn(
                  "flex items-center justify-center gap-3 mt-6 p-3 rounded-xl",
                  "bg-gradient-to-b from-white/[0.06] to-white/[0.02]",
                  "border border-glass-subtle"
                )}
              >
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={cn(
                    "p-2 rounded-xl transition-all duration-200",
                    "bg-gradient-to-b from-white/[0.1] to-white/[0.05]",
                    "border border-glass-subtle",
                    "hover:border-glass disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>

                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(5, ordersData.pagination.totalPages) }, (_, i) => {
                    let pageNum: number;
                    const totalPages = ordersData.pagination.totalPages;

                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={cn(
                          "w-9 h-9 rounded-xl text-sm font-medium transition-all duration-200",
                          "border backdrop-blur-sm",
                          page === pageNum
                            ? "bg-gradient-to-b from-accent-blue/30 to-accent-blue/20 border-accent-blue/40 text-white"
                            : "bg-gradient-to-b from-white/[0.08] to-white/[0.04] border-glass-subtle text-white/60 hover:border-glass hover:text-white"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setPage((p) => Math.min(ordersData.pagination.totalPages, p + 1))}
                  disabled={page === ordersData.pagination.totalPages}
                  className={cn(
                    "p-2 rounded-xl transition-all duration-200",
                    "bg-gradient-to-b from-white/[0.1] to-white/[0.05]",
                    "border border-glass-subtle",
                    "hover:border-glass disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </motion.div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
