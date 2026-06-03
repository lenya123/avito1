"use client";

import { motion } from "framer-motion";
import { useDashboard } from "@/hooks/use-dashboard";
import { Card, ErrorState, Skeleton } from "@/components/ui";
import { stagger, fadeUp } from "@/lib/motion/variants";
import type { Role } from "@/lib/roles/role-config";
import {
  HeroCard,
  HeroCardSkeleton,
  KpiCard,
  KpiCardSkeleton,
  SmartAlerts,
  OrderPipelineCard,
  OrderPipelineCardSkeleton,
  ShipperSummaryCard,
  ShipperSummaryCardSkeleton,
  FulfillmentHealthCard,
  FulfillmentHealthCardSkeleton,
  TopProductsSmart,
  TopProductsSmartSkeleton,
} from "./index";

interface Props {
  role: Role;
}

export function DashboardPage({ role }: Props) {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useDashboard(role);

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

  const today = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const subtitle = today;
  const hasShippers = data && data.shippers.length > 0;

  return (
    <motion.div
      className="max-w-7xl mx-auto px-4 py-6 space-y-6"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <motion.div variants={fadeUp}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Дашборд</h1>
            <p className="text-sm text-white/60 capitalize">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {dataUpdatedAt > 0 && (
              <span className="text-2xs text-white/40">
                Обновлено {Math.max(1, Math.round((Date.now() - dataUpdatedAt) / 60000))} мин назад
              </span>
            )}
            <button
              onClick={() => refetch()}
              className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] border border-glass-subtle transition-colors"
              title="Обновить"
            >
              <svg
                className="w-4 h-4 text-white/60"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>
      </motion.div>

      {/* 1. Hero */}
      <motion.div variants={fadeUp}>
        {isLoading ? (
          <HeroCardSkeleton />
        ) : data ? (
          <HeroCard
            todayProfit={data.hero.todayProfit}
            profitChange={data.hero.profitChange}
            profitSparkline={data.hero.profitSparkline}
            monthlyTarget={data.hero.monthlyTarget}
            monthlyProgress={data.hero.monthlyProgress}
            role={role}
          />
        ) : null}
      </motion.div>

      {/* 2. KPI Row */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading ? (
          <>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </>
        ) : data ? (
          <>
            <KpiCard
              title="Выручка"
              value={`${data.kpis.revenue.value.toLocaleString("ru-RU")} ₽`}
              change={data.kpis.revenue.change}
              sparkline={data.kpis.revenue.sparkline}
              color="var(--accent-blue)"
            />
            <KpiCard
              title="Заказы"
              value={data.kpis.orders.value.toString()}
              change={data.kpis.orders.change}
              sparkline={data.kpis.orders.sparkline}
              color="var(--accent-purple)"
            />
            <KpiCard
              title="Средний чек"
              value={`${data.kpis.aov.value.toLocaleString("ru-RU")} ₽`}
              change={data.kpis.aov.change}
              sparkline={data.kpis.aov.sparkline}
              color="var(--accent-orange)"
            />
            <KpiCard
              title="ROI"
              value={`${data.kpis.roi.value}%`}
              change={data.kpis.roi.change}
              sparkline={data.kpis.roi.sparkline}
              color="var(--accent-teal)"
            />
          </>
        ) : null}
      </motion.div>

      {/* 3. Alerts */}
      {data && data.alerts.length > 0 && (
        <motion.div variants={fadeUp}>
          <SmartAlerts alerts={data.alerts} />
        </motion.div>
      )}

      {/* 3b. Клиенты — новых за 7 / 30 дней */}
      <motion.div variants={fadeUp}>
        {isLoading ? (
          <Card>
            <div className="p-4 animate-pulse flex justify-between">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-24" />
            </div>
          </Card>
        ) : data ? (
          <Card>
            <a
              href="/owner/clients"
              className="block p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors rounded-xl"
            >
              <div>
                <p className="text-sm text-white/60 mb-1">Новых клиентов за 7 дней</p>
                <p className="text-2xl font-bold text-white">{data.newCustomers.last7d}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/40 mb-1">За 30 дней</p>
                <p className="text-xl font-semibold text-white/80">{data.newCustomers.last30d}</p>
              </div>
            </a>
          </Card>
        ) : null}
      </motion.div>

      {/* 3c. Касса — обязательства владельца (защита от кассового разрыва) */}
      <motion.div variants={fadeUp}>
        {isLoading ? (
          <Card>
            <div className="p-4 animate-pulse flex justify-between">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-24" />
            </div>
          </Card>
        ) : data ? (
          <Card>
            <a
              href="/owner/finance"
              className="block p-4 hover:bg-white/[0.02] transition-colors rounded-xl"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/60 mb-1">Должен клиентам (баланс)</p>
                  <p className="text-2xl font-bold text-accent-red">
                    {Math.round(data.treasury.customerBalanceOwed).toLocaleString("ru-RU")} ₽
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/40 mb-1">Клиенты должны (+ВАЙБ)</p>
                  <p className="text-xl font-semibold text-accent-orange">
                    {Math.round(data.treasury.vibeDebtTotal).toLocaleString("ru-RU")} ₽
                  </p>
                </div>
              </div>
              <p className="text-2xs text-white/35 mt-2 leading-relaxed">
                Держите «Должен клиентам» на картах нетронутым. +ВАЙБ-долг — ещё не на картах.
                Подробно — в Финансах → Касса.
              </p>
            </a>
          </Card>
        ) : null}
      </motion.div>

      {/* 4. Operations */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading ? (
          <>
            <OrderPipelineCardSkeleton />
            {role === "owner" && <ShipperSummaryCardSkeleton />}
          </>
        ) : data ? (
          <>
            <OrderPipelineCard pipeline={data.pipeline} />
            {hasShippers && (
              <ShipperSummaryCard
                shippers={data.shippers}
                totalShippedToday={data.totalShippedToday}
                pendingShipment={data.pipeline.awaitingShipment + data.pipeline.collecting}
              />
            )}
          </>
        ) : null}
      </motion.div>

      {/* 5. Fulfillment + Products */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading ? (
          <>
            <FulfillmentHealthCardSkeleton />
            <TopProductsSmartSkeleton />
          </>
        ) : data ? (
          <>
            <FulfillmentHealthCard
              avgHoursToShip={data.fulfillment.avgHoursToShip}
              avgHoursToDeliver={data.fulfillment.avgHoursToDeliver}
              overdueCount={data.fulfillment.overdueCount}
              slaComplianceRate={data.fulfillment.slaComplianceRate}
              rateToday={data.fulfillment.rateToday}
              ordersPerShipper={data.fulfillment.ordersPerShipper}
            />
            <TopProductsSmart products={data.topProducts} />
          </>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
