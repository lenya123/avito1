"use client";

import { Card, Skeleton } from "@/components/ui";
import { useAvitoSession, useAvitoOrders } from "@/hooks/use-avito";
import type { AvitoWebOrder } from "@/lib/avito/types";

function OrderStatusBadge({ color, label }: { color: string; label: string }) {
  const colorClass =
    color.toLowerCase().includes("orange") || color.toLowerCase().includes("yellow")
      ? "bg-accent-orange/20 text-accent-orange"
      : color.toLowerCase().includes("green") || color.toLowerCase().includes("success")
        ? "bg-accent-green/20 text-accent-green"
        : "bg-white/[0.08] text-white/60";

  return (
    <span className={`text-xs px-2 py-0.5 rounded-xl font-medium ${colorClass}`}>{label}</span>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function OrderRow({ order }: { order: AvitoWebOrder }) {
  const imgUrl = order.imgSet[0]?.src;
  const title = order.imgSet[0]?.alt || `Заказ #${order.orderId}`;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={title}
          className="w-10 h-10 rounded-xl object-cover flex-shrink-0 bg-white/5"
        />
      ) : (
        <div className="w-10 h-10 rounded-xl bg-white/5 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 truncate">{title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <OrderStatusBadge color={order.status.color} label={order.status.label} />
          {order.provider.trackingNumber && (
            <span className="text-xs text-white/40 font-mono truncate max-w-[120px]">
              {order.provider.trackingNumber}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-sm font-medium text-white/80">{order.cost.total} ₽</span>
        <span className="text-xs text-white/40">{formatDate(order.createdAt)}</span>
      </div>
    </div>
  );
}

export function DashboardOrders() {
  const { data: session } = useAvitoSession();
  const { data: ordersData, isLoading } = useAvitoOrders(1, 3);

  // Если сессия не активна — не показываем секцию заказов
  // (форма подключения уже отображается вверху страницы)
  if (session?.status !== "active" || !session?.hasLogin) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Заказы</h2>
        <Card className="p-4 text-center text-sm text-white/40">
          Подключите аккаунт Avito вверху страницы
        </Card>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">Заказы</h2>
        <span className="text-sm text-white/40">Авито Доставка</span>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : !ordersData?.orders?.length ? (
          <div className="p-4 text-center text-sm text-white/40">Заказов пока нет</div>
        ) : (
          <>
            <div className="px-4">
              {ordersData.orders.map((order) => (
                <OrderRow key={order.orderId} order={order} />
              ))}
            </div>
            {ordersData.total > 3 && (
              <div className="px-4 py-3 border-t border-white/5">
                <span className="text-sm text-accent-blue">Все заказы ({ordersData.total}) →</span>
              </div>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
