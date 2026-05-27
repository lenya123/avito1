"use client";

import { useEffect, useState } from "react";
import { Card, Skeleton } from "@/components/ui";
import { useAvitoSession, useAvitoOrders } from "@/hooks/use-avito";

// API /api/avito/orders отдаёт строку из таблицы avito_orders (snake_case).
// AvitoWebOrder (camelCase nested) — устаревший тип под прямой ответ Avito web API,
// его endpoint больше не использует, отображаем плоскую DB-структуру напрямую.
interface DeliveryDetails {
  pickupAddress?: string | null;
  pickupSchedule?: string | null;
  parcelId?: string | null;
  parcelIdFormatted?: string | null;
  confirmCode?: string | null;
  barcodeUrl?: string | null;
  barcodeType?: string | null;
  isBarcodeAvailable?: boolean;
  flow?: "return" | "dispatch" | "receive" | "unknown";
  deadline?: string | null;
  shipmentId?: string | null;
}

interface DbOrder {
  avito_order_id?: string;
  item_title?: string | null;
  item_img_url?: string | null;
  status?: string | null;
  status_label?: string | null;
  required_action?: boolean | null;
  cost_total?: number | null;
  provider?: string | null;
  provider_label?: string | null;
  tracking_number?: string | null;
  created_at_avito?: string | null;
  delivery_details?: DeliveryDetails | null;
}

function OrderStatusBadge({ status, label }: { status: string | null | undefined; label: string }) {
  const s = (status ?? "").toLowerCase();
  const colorClass =
    s.includes("delivery") || s.includes("transit") || s.includes("waiting")
      ? "bg-accent-orange/20 text-accent-orange"
      : s.includes("complet") || s.includes("delivered") || s.includes("success")
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

function OrderRow({ order }: { order: DbOrder }) {
  const imgUrl = order.item_img_url ?? null;
  const title = order.item_title || `Заказ #${order.avito_order_id ?? ""}`;
  const cost = order.cost_total ?? 0;
  const statusLabel = order.status_label || order.status || "—";

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
          <OrderStatusBadge status={order.status} label={statusLabel} />
          {order.tracking_number && (
            <span className="text-xs text-white/40 font-mono truncate max-w-[120px]">
              {order.tracking_number}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-sm font-medium text-white/80">{cost.toLocaleString("ru")} ₽</span>
        <span className="text-xs text-white/40">{formatDate(order.created_at_avito)}</span>
      </div>
    </div>
  );
}

function DeliveryActionBlock({ order }: { order: DbOrder }) {
  const [d, setD] = useState<DeliveryDetails | null | undefined>(order.delivery_details);
  const [refreshing, setRefreshing] = useState(false);

  const doRefresh = async () => {
    if (!order.avito_order_id) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/avito/orders/refresh-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.avito_order_id }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.details) setD(data.details);
      }
    } catch {/* ignore */}
    setRefreshing(false);
  };

  // Авто-refresh при mount если есть confirmCode (он обновляется каждые 24ч)
  useEffect(() => {
    if (order.required_action && order.delivery_details?.confirmCode) {
      doRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.avito_order_id]);

  if (!order.required_action || !d) return null;
  const flowLabel =
    d.flow === "return" ? "Заберите возврат" :
    d.flow === "dispatch" ? "Отправьте заказ" :
    d.flow === "receive" ? "Получите посылку" : "Действие требуется";
  return (
    <div className="mt-2 p-3 rounded-xl bg-accent-orange/10 border border-accent-orange/30 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-accent-orange">{flowLabel}</span>
        {order.provider_label && (
          <span className="text-2xs text-white/60">{order.provider_label}</span>
        )}
      </div>
      {d.pickupAddress && (
        <div>
          <div className="text-2xs text-white/40 mb-0.5">Куда нести</div>
          <div className="text-xs text-white/90">{d.pickupAddress}</div>
          {d.pickupSchedule && (
            <div className="text-2xs text-white/50 mt-0.5">{d.pickupSchedule}</div>
          )}
        </div>
      )}
      {d.confirmCode && (
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-accent-orange/15 border border-accent-orange/40">
          <div>
            <div className="text-2xs text-accent-orange mb-0.5 flex items-center gap-1.5">
              Код подтверждения (назвать в отделении)
              {refreshing && <span className="text-white/40">обновляю…</span>}
            </div>
            <div className="text-2xl font-mono font-bold text-white tracking-widest">
              {d.confirmCode}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(d.confirmCode ?? "")}
              className="text-2xs px-2.5 py-1.5 rounded-lg bg-accent-orange/25 text-accent-orange hover:bg-accent-orange/40 hover:text-white transition"
            >
              копировать
            </button>
            <button
              type="button"
              onClick={doRefresh}
              disabled={refreshing}
              className="text-2xs px-2.5 py-1 rounded-lg bg-white/[0.08] text-white/70 hover:bg-white/15 hover:text-white transition disabled:opacity-50"
            >
              обновить
            </button>
          </div>
        </div>
      )}
      {d.parcelIdFormatted && (
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xs text-white/40 mb-0.5">Номер отправления (для справки)</div>
            <div className="text-xs font-mono text-white/80 tracking-wider">
              {d.parcelIdFormatted}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(d.parcelId ?? d.parcelIdFormatted ?? "")}
            className="text-2xs px-2 py-1 rounded-lg bg-white/[0.08] text-white/70 hover:bg-white/15 hover:text-white transition"
          >
            копировать
          </button>
        </div>
      )}
      {d.isBarcodeAvailable && d.barcodeUrl && (
        <div>
          <div className="text-2xs text-white/40 mb-1">Штрих-код / QR</div>
          <img
            src={d.barcodeUrl}
            alt="barcode"
            className="w-full max-h-32 object-contain bg-white rounded-lg p-2"
          />
        </div>
      )}
      {d.deadline && (
        <div className="text-2xs text-accent-orange">До {d.deadline} включительно</div>
      )}
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
              {(ordersData.orders as unknown as DbOrder[]).map((order, idx) => (
                <div key={order.avito_order_id ?? idx}>
                  <OrderRow order={order} />
                  <DeliveryActionBlock order={order} />
                </div>
              ))}
            </div>
            {(ordersData.total ?? 0) > 3 && (
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
