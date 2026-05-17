"use client";

import { motion } from "framer-motion";
import { useOwnerDashboard } from "@/hooks/use-owner-dashboard";
import { ErrorState } from "@/components/ui";
import {
  MetricCard,
  MetricCardSkeleton,
  AlertCard,
  ChartCard,
  ChartCardSkeleton,
  TopProductsCard,
  TopClientsCard,
  TopListCardSkeleton,
  RecentOrdersCard,
  RecentOrdersCardSkeleton,
} from "@/components/owner/dashboard";

export default function OwnerDashboardPage() {
  const { data, isLoading, error, refetch } = useOwnerDashboard();

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить данные dashboard"
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
        <p className="text-white/60">Обзор бизнеса за сегодня</p>
      </motion.div>

      {/* Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {isLoading ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : data ? (
          <>
            <MetricCard
              title="Заказов"
              value={data.today.orders}
              change={data.today.ordersChange}
              color="purple"
              icon={
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              }
            />
            <MetricCard
              title="Выручка"
              value={`${data.today.revenue.toLocaleString("ru-RU")} ₽`}
              change={data.today.revenueChange}
              color="blue"
              icon={
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
            <MetricCard
              title="Прибыль"
              value={`${data.today.profit.toLocaleString("ru-RU")} ₽`}
              change={data.today.profitChange}
              color="green"
              icon={
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
              }
            />
            <MetricCard
              title="Новых клиентов"
              value={data.today.newClients}
              change={data.today.clientsChange}
              color="orange"
              icon={
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
              }
            />
          </>
        ) : null}
      </motion.div>

      {/* Alerts */}
      {data && data.alerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <AlertCard alerts={data.alerts} />
        </motion.div>
      )}

      {/* Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {isLoading ? <ChartCardSkeleton /> : data ? <ChartCard data={data.weekChart} /> : null}
      </motion.div>

      {/* Top lists & Recent orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {isLoading ? (
            <TopListCardSkeleton />
          ) : data ? (
            <TopProductsCard products={data.topProducts} />
          ) : null}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          {isLoading ? (
            <TopListCardSkeleton />
          ) : data ? (
            <TopClientsCard clients={data.topClients} />
          ) : null}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          {isLoading ? (
            <RecentOrdersCardSkeleton />
          ) : data ? (
            <RecentOrdersCard orders={data.recentOrders} />
          ) : null}
        </motion.div>
      </div>

      {/* Clients stats summary */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <p className="text-2xl font-bold text-white">{data.clientsStats.total}</p>
            <p className="text-sm text-white/60">Всего клиентов</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <p className="text-2xl font-bold text-accent-green">{data.clientsStats.active}</p>
            <p className="text-sm text-white/60">Активных</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <p className="text-2xl font-bold text-accent-purple">{data.clientsStats.premium}</p>
            <p className="text-sm text-white/60">Premium</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-card">
            <p className="text-2xl font-bold text-accent-orange">{data.clientsStats.vibePlus}</p>
            <p className="text-sm text-white/60">+ВАЙБ</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
