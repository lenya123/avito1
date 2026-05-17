"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  useOwnerAnalytics,
  type AnalyticsFilters,
  PERIOD_OPTIONS,
} from "@/hooks/use-owner-analytics";
import { ErrorState, Card, CardHeader, CardContent } from "@/components/ui";
import {
  SalesChart,
  SalesChartSkeleton,
  StatsGrid,
  StatsGridSkeleton,
  TopProductsList,
  TopClientsList,
  TopListSkeleton,
} from "@/components/owner/analytics";
import { cn } from "@/utils/cn";

export default function OwnerAnalyticsPage() {
  const [filters, setFilters] = useState<AnalyticsFilters>({
    period: "month",
  });

  const { data, isLoading, error, refetch } = useOwnerAnalytics(filters);

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить аналитику"
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Аналитика</h1>
          <p className="text-white/60 mt-1">Детальная статистика бизнеса</p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilters({ ...filters, period: option.value })}
              className={cn(
                "px-4 py-2 text-sm rounded-lg border transition-colors duration-200",
                filters.period === option.value
                  ? "bg-white/[0.12] border-glass-active text-white shadow-glass-inset"
                  : "border-glass text-white/60 hover:text-white hover:border-glass-active"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Period info */}
      {data && (
        <p className="text-sm text-white/60">
          {new Date(data.period.from).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
          })}{" "}
          —{" "}
          {new Date(data.period.to).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}

      {/* Sales stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {isLoading ? (
          <StatsGridSkeleton count={4} />
        ) : data ? (
          <StatsGrid
            stats={[
              { label: "Заказов", value: data.sales.stats.totalOrders },
              {
                label: "Выручка",
                value: `${data.sales.stats.revenue.toLocaleString()} ₽`,
                color: "green",
              },
              {
                label: "Себестоимость",
                value: `${data.sales.stats.cost.toLocaleString()} ₽`,
                color: "orange",
              },
              {
                label: "Прибыль",
                value: `${data.sales.stats.profit.toLocaleString()} ₽`,
                color: "purple",
              },
            ]}
          />
        ) : null}
      </motion.div>

      {/* Sales chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">Продажи по дням</h2>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <SalesChartSkeleton />
            ) : data ? (
              <SalesChart data={data.sales.chart} />
            ) : null}
          </CardContent>
        </Card>
      </motion.div>

      {/* Clients & Products stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Clients */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">Клиенты</h2>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <StatsGridSkeleton count={4} />
            ) : data ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
                    <p className="text-xl font-bold text-white">{data.clients.stats.total}</p>
                    <p className="text-xs text-white/60">Всего</p>
                  </div>
                  <div className="p-3 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
                    <p className="text-xl font-bold text-accent-green">{data.clients.stats.new}</p>
                    <p className="text-xs text-white/60">Новых</p>
                  </div>
                  <div className="p-3 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
                    <p className="text-xl font-bold text-accent-purple">
                      {data.clients.stats.active}
                    </p>
                    <p className="text-xs text-white/60">Активных</p>
                  </div>
                </div>

                {/* Levels distribution */}
                <div className="pt-3 border-t border-glass">
                  <p className="text-sm text-white/60 mb-2">По уровням</p>
                  <div className="flex gap-2">
                    {Object.entries(data.clients.stats.byLevel).map(([level, count]) => (
                      <div
                        key={level}
                        className="flex-1 p-2 rounded-lg bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass text-center"
                      >
                        <p className="text-sm font-medium text-white">{count}</p>
                        <p className="text-2xs text-white/40">Ур. {level.replace("level", "")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Products */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">Товары</h2>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <StatsGridSkeleton count={3} />
            ) : data ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
                    <p className="text-xl font-bold text-white">{data.products.stats.total}</p>
                    <p className="text-xs text-white/60">Всего</p>
                  </div>
                  <div className="p-3 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
                    <p className="text-xl font-bold text-accent-green">
                      {data.products.stats.active}
                    </p>
                    <p className="text-xs text-white/60">Активных</p>
                  </div>
                  <div className="p-3 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
                    <p className="text-xl font-bold text-accent-purple">
                      {data.products.stats.totalStock}
                    </p>
                    <p className="text-xs text-white/60">На складе</p>
                  </div>
                </div>

                {/* Categories */}
                {data.products.categories.length > 0 && (
                  <div className="pt-3 border-t border-glass">
                    <p className="text-sm text-white/60 mb-2">По категориям</p>
                    <div className="space-y-1">
                      {data.products.categories.slice(0, 5).map((cat) => (
                        <div key={cat.name} className="flex items-center justify-between text-sm">
                          <span className="text-white/60">{cat.name}</span>
                          <span className="text-white/40">{cat.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </motion.div>

      {/* Top lists */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Top products */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">Топ товаров</h2>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TopListSkeleton count={5} />
            ) : data ? (
              <TopProductsList products={data.products.top} />
            ) : null}
          </CardContent>
        </Card>

        {/* Top clients */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-white">Топ клиентов</h2>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TopListSkeleton count={5} />
            ) : data ? (
              <TopClientsList clients={data.topClients} />
            ) : null}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
