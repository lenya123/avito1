"use client";

import Link from "next/link";
import { useAvitoOverview } from "@/hooks/use-avito";
import { Card, Skeleton } from "@/components/ui";
import { cn } from "@/utils/cn";

interface OrdersStats {
  total: number;
  active: number;
  successful: number;
  activeReturns: number;
  completedReturns: number;
}

function StatItem({
  label,
  value,
  color = "text-white",
  href,
}: {
  label: string;
  value: number;
  color?: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
      <p className="text-xs text-white/60 mt-0.5">{label}</p>
    </>
  );
  const base =
    "p-3 rounded-xl bg-white/[0.04] border border-glass block transition-colors";
  if (href) {
    return (
      <Link href={href} className={cn(base, "hover:bg-white/[0.08] cursor-pointer")}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

export function DashboardOrdersStats() {
  const { data: overview, isLoading } = useAvitoOverview();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stats: OrdersStats | undefined = (overview as any)?.ordersStats;

  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-3">Заказы за месяц</h2>

      {isLoading || !stats ? (
        <Card className="p-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatItem
              label="Всего заказов"
              value={stats.total}
              color="text-white"
              href="/owner/orders?source=avito"
            />
            <StatItem
              label="Активные"
              value={stats.active}
              color="text-accent-blue"
              href="/owner/orders?source=avito&status=paid"
            />
            <StatItem
              label="Успешные"
              value={stats.successful}
              color="text-green-400"
              href="/owner/orders?source=avito&status=delivered"
            />
            <StatItem
              label="Активные возвраты"
              value={stats.activeReturns}
              color="text-accent-orange"
              href="/owner/orders?source=avito&status=return"
            />
            <StatItem
              label="Завершённые возвраты"
              value={stats.completedReturns}
              color="text-white/60"
              href="/owner/orders?source=avito&status=return_done"
            />
          </div>
        </Card>
      )}
    </section>
  );
}
