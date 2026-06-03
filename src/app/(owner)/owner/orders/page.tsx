"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  useOwnerOrders,
  useOwnerStats,
  type OrdersFilters,
  type OwnerStatsParams,
} from "@/hooks/use-owner-orders";
import { formatPrice } from "@/utils/pricing";
import { ErrorState, Button, Empty, EmptyPresets, Pagination } from "@/components/ui";
import {
  StatsCard,
  StatsCardSkeleton,
  SalesChart,
  SalesChartSkeleton,
  type BarSelectionData,
} from "@/components/owner/charts";
import {
  OrdersFiltersComponent,
  OrderCard,
  OrderCardSkeleton,
  type StatsPeriod,
} from "@/components/owner/orders";
import { saveAs } from "file-saver";

/** ISO-дата YYYY-MM-DD из Date */
const toISODate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export default function OwnerOrdersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Stats period (for chart + stats cards)
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("all");
  const [barSelection, setBarSelection] = useState<BarSelectionData>(null);

  // Stats params based on period
  const statsParams: OwnerStatsParams = useMemo(() => {
    const params: OwnerStatsParams = {};
    if (statsPeriod === "day") {
      params.granularity = "day";
      const d = new Date();
      d.setDate(d.getDate() - 13);
      params.dateFrom = toISODate(d);
      params.dateTo = toISODate(new Date());
    } else if (statsPeriod === "week") {
      params.granularity = "week";
      const d = new Date();
      d.setDate(d.getDate() - 83);
      params.dateFrom = toISODate(d);
      params.dateTo = toISODate(new Date());
    } else if (statsPeriod === "month") {
      params.granularity = "month";
      const d = new Date();
      d.setMonth(d.getMonth() - 11);
      d.setDate(1);
      params.dateFrom = toISODate(d);
      params.dateTo = toISODate(new Date());
    }
    return params;
  }, [statsPeriod]);

  const { data: statsData, isLoading: statsLoading } = useOwnerStats(statsParams);

  // Display stats: from selected bar or from summary
  const displayStats = useMemo(() => {
    if (!statsData) return null;
    if (barSelection) {
      const roi =
        barSelection.invested > 0
          ? Math.round(
              ((barSelection.revenue - barSelection.invested) / barSelection.invested) * 100
            )
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

  // Order list filters (from URL)
  const filters = useMemo<OrdersFilters>(
    () => ({
      page: Number(searchParams.get("page")) || 1,
      limit: 20,
      status: (searchParams.get("status") as OrdersFilters["status"]) || "all",
      deliveryService: (searchParams.get("ds") as OrdersFilters["deliveryService"]) || "all",
      payment: (searchParams.get("payment") as OrdersFilters["payment"]) || "all",
      sort: (searchParams.get("sort") as OrdersFilters["sort"]) || "created_at",
      order: (searchParams.get("order") as OrdersFilters["order"]) || "desc",
      search: searchParams.get("q") || undefined,
      dateFrom: searchParams.get("from") || undefined,
      dateTo: searchParams.get("to") || undefined,
      clientId: searchParams.get("clientId") || undefined,
      productId: searchParams.get("productId") || undefined,
      sellerId: searchParams.get("sellerId") || undefined,
    }),
    [searchParams]
  );

  const setFilters = useCallback(
    (next: OrdersFilters) => {
      const params = new URLSearchParams();
      if (next.page && next.page > 1) params.set("page", String(next.page));
      if (next.status && next.status !== "all") params.set("status", next.status);
      if (next.deliveryService && next.deliveryService !== "all")
        params.set("ds", next.deliveryService);
      if (next.payment && next.payment !== "all") params.set("payment", next.payment);
      if (next.sort && next.sort !== "created_at") params.set("sort", next.sort);
      if (next.order && next.order !== "desc") params.set("order", next.order);
      if (next.search) params.set("q", next.search);
      if (next.dateFrom) params.set("from", next.dateFrom);
      if (next.dateTo) params.set("to", next.dateTo);
      if (next.clientId) params.set("clientId", next.clientId);
      if (next.productId) params.set("productId", next.productId);
      if (next.sellerId) params.set("sellerId", next.sellerId);
      const qs = params.toString();
      router.replace(`/owner/orders${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router]
  );

  // When a chart bar is selected, override date filters to match that bar's range
  const effectiveFilters = useMemo<OrdersFilters>(() => {
    if (!barSelection) return filters;
    return {
      ...filters,
      dateFrom: barSelection.dateFrom,
      dateTo: barSelection.dateTo,
      page: 1,
    };
  }, [filters, barSelection]);

  const { data, isLoading, error, refetch } = useOwnerOrders(effectiveFilters);

  // Handlers
  const handlePeriodChange = useCallback((period: StatsPeriod) => {
    setStatsPeriod(period);
    setBarSelection(null);
  }, []);

  const handleBarSelect = useCallback((selection: BarSelectionData) => {
    setBarSelection(selection);
  }, []);

  const [isExporting, setIsExporting] = useState(false);

  // Экспорт уважает текущие фильтры страницы (статус/служба/даты/поиск/
  // клиент/товар) — выгружает ровно то, что на экране.
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/owner/orders/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: effectiveFilters.status,
          deliveryService: effectiveFilters.deliveryService,
          payment: effectiveFilters.payment,
          search: effectiveFilters.search,
          dateFrom: effectiveFilters.dateFrom,
          dateTo: effectiveFilters.dateTo,
          clientId: effectiveFilters.clientId,
          productId: effectiveFilters.productId,
        }),
      });
      if (!res.ok) throw new Error("Ошибка экспорта");
      const blob = await res.blob();
      const date = new Date().toISOString().slice(0, 10);
      saveAs(blob, `заказы_${date}.xlsx`);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setIsExporting(false);
    }
  }, [effectiveFilters]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить список заказов"
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Заказы</h1>
          <p className="text-white/60 mt-1 text-sm">Управление всеми заказами системы</p>
        </div>
        {data && data.orders.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="bg-white/[0.06] text-white/60 border border-glass-subtle shadow-glass-inset hover:text-white hover:bg-white/[0.10] hover:border-white/20"
            onClick={() => handleExport()}
            isLoading={isExporting}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Экспорт
          </Button>
        )}
      </motion.div>

      {/* Statistics section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <h2 className="text-lg font-semibold text-white mb-4">Статистика</h2>

        {/* Stats cards */}
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
              <StatsCard
                title="Заказов"
                value={displayStats.totalOrders}
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
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                }
              />
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
                color="green"
              />
              <StatsCard
                title="Себестоимость"
                value={formatPrice(displayStats.totalInvested)}
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
                color="orange"
              />
              <StatsCard
                title="Прибыль (ROI)"
                value={formatPrice(displayStats.totalProfit)}
                subtitle={`ROI ${displayStats.roi > 0 ? "+" : ""}${displayStats.roi}%`}
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
                color="purple"
              />
            </>
          )}
        </div>

        {/* Sales chart */}
        {statsLoading ? (
          <SalesChartSkeleton />
        ) : statsData?.chartData ? (
          <SalesChart
            data={statsData.chartData}
            granularity={statsData.granularity}
            onBarSelect={handleBarSelect}
          />
        ) : null}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-4"
      >
        <OrdersFiltersComponent
          filters={filters}
          onChange={setFilters}
          period={statsPeriod}
          onPeriodChange={handlePeriodChange}
        />
      </motion.div>

      {/* Orders section */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">Заказы</h2>
        {data && <p className="text-sm text-white/40">{data.pagination.total} шт.</p>}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <>
            <OrderCardSkeleton />
            <OrderCardSkeleton />
            <OrderCardSkeleton />
          </>
        ) : data?.orders.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Empty {...EmptyPresets.orders} />
          </motion.div>
        ) : (
          <>
            {data?.orders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.03 }}
              >
                <OrderCard order={order} index={index} />
              </motion.div>
            ))}

            {/* Pagination */}
            {data && data.pagination.totalPages > 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <Pagination
                  page={filters.page || 1}
                  totalPages={data.pagination.totalPages}
                  onPageChange={(p) => setFilters({ ...filters, page: p })}
                />
              </motion.div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
