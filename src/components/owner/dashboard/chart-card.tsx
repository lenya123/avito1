"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, Skeleton } from "@/components/ui";

interface ChartCardProps {
  data: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
}

export function ChartCard({ data }: ChartCardProps) {
  const maxRevenue = useMemo(() => Math.max(...data.map((d) => d.revenue), 1), [data]);

  const maxOrders = useMemo(() => Math.max(...data.map((d) => d.orders), 1), [data]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const days = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    return days[date.getDay()];
  };

  return (
    <Card className="backdrop-blur-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border-glass shadow-card">
      <CardHeader>
        <h3 className="text-lg font-semibold text-white">За неделю</h3>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-2 h-40">
          {data.map((item, index) => {
            const revenueHeight = (item.revenue / maxRevenue) * 100;
            const ordersHeight = (item.orders / maxOrders) * 100;

            return (
              <div key={index} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex items-end justify-center gap-1 h-28">
                  {/* Revenue bar */}
                  <div
                    className="w-3 bg-gradient-to-t from-purple-500 to-pink-500 rounded-t-sm transition-all duration-300"
                    style={{ height: `${Math.max(revenueHeight, 4)}%` }}
                    title={`Выручка: ${item.revenue.toLocaleString("ru-RU")} ₽`}
                  />
                  {/* Orders bar */}
                  <div
                    className="w-3 bg-gradient-to-t from-blue-500 to-cyan-500 rounded-t-sm transition-all duration-300"
                    style={{ height: `${Math.max(ordersHeight, 4)}%` }}
                    title={`Заказов: ${item.orders}`}
                  />
                </div>
                <span className="text-xs text-white/40">{formatDate(item.date)}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-glass">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-purple-500 to-pink-500" />
            <span className="text-xs text-white/60">Выручка</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-blue-500 to-cyan-500" />
            <span className="text-xs text-white/60">Заказы</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ChartCardSkeleton() {
  return (
    <Card className="backdrop-blur-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border-glass shadow-card">
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-2 h-40">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex items-end justify-center gap-1 h-28">
                <Skeleton className="w-3 h-16 rounded-t-sm" />
                <Skeleton className="w-3 h-12 rounded-t-sm" />
              </div>
              <Skeleton className="h-3 w-6" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
