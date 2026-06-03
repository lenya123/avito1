"use client";

import { motion } from "framer-motion";

interface SalesChartProps {
  data: Array<{
    date: string;
    orders: number;
    revenue: number;
    profit: number;
  }>;
}

export function SalesChart({ data }: SalesChartProps) {
  if (data.length === 0) {
    return <p className="text-center text-white/40 py-8">Нет данных для отображения</p>;
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue));
  const maxOrders = Math.max(...data.map((d) => d.orders));

  return (
    <div className="space-y-4">
      {/* Легенда */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-accent-green" />
          <span className="text-white/60">Выручка</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-accent-purple" />
          <span className="text-white/60">Заказов</span>
        </div>
      </div>

      {/* График */}
      <div className="h-48 flex items-end gap-1">
        {data.map((item, index) => {
          const revenueHeight = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
          const ordersHeight = maxOrders > 0 ? (item.orders / maxOrders) * 100 : 0;

          return (
            <div key={item.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end justify-center gap-0.5 h-40">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${revenueHeight}%` }}
                  transition={{ delay: index * 0.05, duration: 0.2 }}
                  className="w-2 bg-accent-green/60 rounded-t"
                  title={`${item.revenue.toLocaleString()} ₽`}
                />
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${ordersHeight}%` }}
                  transition={{ delay: index * 0.05 + 0.1, duration: 0.2 }}
                  className="w-2 bg-accent-purple/60 rounded-t"
                  title={`${item.orders} заказов`}
                />
              </div>
              <span className="text-2xs text-white/40">
                {new Date(item.date).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SalesChartSkeleton() {
  return (
    <div className="h-64 flex items-end gap-1 animate-pulse">
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end justify-center gap-0.5 h-40">
            <div
              className="w-2 bg-white/10 rounded-t"
              style={{ height: `${Math.random() * 80 + 20}%` }}
            />
            <div
              className="w-2 bg-white/10 rounded-t"
              style={{ height: `${Math.random() * 80 + 20}%` }}
            />
          </div>
          <div className="h-3 w-8 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  );
}
