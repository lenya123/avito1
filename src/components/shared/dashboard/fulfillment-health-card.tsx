"use client";

import { cn } from "@/utils/cn";
import { Card, Skeleton } from "@/components/ui";

interface FulfillmentHealthCardProps {
  avgHoursToShip: number;
  avgHoursToDeliver: number;
  overdueCount: number;
  slaComplianceRate: number;
  rateToday: number;
  ordersPerShipper: number;
}

function formatHours(hours: number): string {
  if (hours < 1) return "< 1 ч";
  if (hours < 24) return `${hours} ч`;
  const days = Math.round(hours / 24);
  return `${days} д`;
}

function MetricRow({
  icon,
  label,
  value,
  colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-white/60">{label}</span>
      </div>
      <span className={cn("text-sm font-semibold", colorClass)}>{value}</span>
    </div>
  );
}

export function FulfillmentHealthCard({
  avgHoursToShip,
  avgHoursToDeliver,
  overdueCount,
  slaComplianceRate,
  rateToday,
  ordersPerShipper,
}: FulfillmentHealthCardProps) {
  const shipSpeedColor =
    avgHoursToShip <= 24
      ? "text-accent-green"
      : avgHoursToShip <= 48
        ? "text-accent-orange"
        : "text-accent-red";

  const deliverySpeedColor =
    avgHoursToDeliver <= 96
      ? "text-accent-green"
      : avgHoursToDeliver <= 144
        ? "text-accent-orange"
        : "text-accent-red";

  const rateColor =
    rateToday >= 80
      ? "text-accent-green"
      : rateToday >= 50
        ? "text-accent-orange"
        : "text-accent-red";

  const slaColor =
    slaComplianceRate >= 90
      ? "text-accent-green"
      : slaComplianceRate >= 70
        ? "text-accent-orange"
        : "text-accent-red";

  const clockIcon = (
    <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );

  const truckIcon = (
    <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
      />
    </svg>
  );

  const warningIcon = (
    <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );

  const checkIcon = (
    <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );

  const shieldIcon = (
    <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );

  const usersIcon = (
    <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );

  return (
    <Card>
      <div className="p-4">
        <h3 className="text-base font-medium text-white mb-4">
          Операционные показатели <span className="text-sm text-white/30 font-normal">(7 дн.)</span>
        </h3>

        {/* Отправка */}
        <p className="text-2xs text-white/40 uppercase tracking-wider mb-2">Отправка</p>
        <div className="space-y-3 mb-4">
          <MetricRow
            icon={clockIcon}
            label="Среднее до отправки"
            value={avgHoursToShip > 0 ? formatHours(avgHoursToShip) : "—"}
            colorClass={shipSpeedColor}
          />
          <MetricRow
            icon={warningIcon}
            label="Медленные заказы"
            value={String(overdueCount)}
            colorClass={overdueCount > 0 ? "text-accent-orange" : "text-accent-green"}
          />
          <MetricRow
            icon={usersIcon}
            label="Заказов на отправщика"
            value={ordersPerShipper > 0 ? String(ordersPerShipper) : "—"}
            colorClass="text-white"
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06] mb-4" />

        {/* Доставка */}
        <p className="text-2xs text-white/40 uppercase tracking-wider mb-2">Доставка</p>
        <div className="space-y-3">
          <MetricRow
            icon={truckIcon}
            label="Среднее до доставки"
            value={avgHoursToDeliver > 0 ? formatHours(avgHoursToDeliver) : "—"}
            colorClass={deliverySpeedColor}
          />
          <MetricRow
            icon={shieldIcon}
            label="SLA соблюдение"
            value={`${slaComplianceRate}%`}
            colorClass={slaColor}
          />
          <MetricRow
            icon={checkIcon}
            label="Выполнение сегодня"
            value={`${rateToday}%`}
            colorClass={rateColor}
          />
        </div>
      </div>
    </Card>
  );
}

export function FulfillmentHealthCardSkeleton() {
  return (
    <Card>
      <div className="p-4 animate-pulse">
        <Skeleton className="h-5 w-48 mb-4" />
        <Skeleton className="h-3 w-20 mb-2" />
        <div className="space-y-3 mb-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="w-4 h-4 rounded" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
        <div className="h-px bg-white/[0.06] mb-4" />
        <Skeleton className="h-3 w-20 mb-2" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="w-4 h-4 rounded" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
