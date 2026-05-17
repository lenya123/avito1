"use client";

import { cn } from "@/utils/cn";
import { useAvitoOverview } from "@/hooks/use-avito";
import { Skeleton } from "@/components/ui";

// Окно статистики по заказам (заменяет воронку конверсии по ТЗ):
// всего за месяц, активные, успешные, активные возвраты, завершённые возвраты.
export function DashboardOrdersStats() {
  const { data: overview, isLoading } = useAvitoOverview();

  const wrap = (children: React.ReactNode) => (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden p-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <h3 className="text-sm font-semibold text-white mb-3">Заказы за месяц</h3>
      {children}
    </div>
  );

  if (isLoading || !overview) {
    return wrap(
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  const s = overview.ordersStats;
  const cells: { label: string; value: number; color: string }[] = [
    { label: "Всего", value: s.totalMonth, color: "text-white" },
    { label: "Активные", value: s.active, color: "text-accent-blue" },
    { label: "Успешные", value: s.successful, color: "text-accent-green" },
    { label: "Возвраты актив.", value: s.returnsActive, color: "text-accent-orange" },
    { label: "Возвраты заверш.", value: s.returnsCompleted, color: "text-white/70" },
  ];

  return wrap(
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {cells.map((c) => (
        <div key={c.label} className="text-center p-3 rounded-xl bg-white/[0.04]">
          <p className={cn("text-xl font-semibold", c.color)}>
            {c.value.toLocaleString("ru")}
          </p>
          <p className="text-xs text-white/40 mt-0.5">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
