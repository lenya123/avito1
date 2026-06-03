"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useOwnerOrder, useUpdateOwnerOrder } from "@/hooks/use-owner-orders";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_BADGE_VARIANTS as STATUS_VARIANTS,
  DELIVERY_SERVICE_LABELS,
} from "@/lib/constants/order-status";
import {
  ErrorState,
  Button,
  Card,
  CardContent,
  CardHeader,
  Badge,
  Modal,
  Input,
  Skeleton,
} from "@/components/ui";
import { OrderPaymentReview } from "@/components/owner/orders";
import { LogisticsTimeline } from "@/components/owner/orders/logistics-timeline";

import type { OrderStatus } from "@/types/database";

const CANCELLABLE_STATUSES = ["paid", "collecting", "problem"];

const ACTION_LABELS: Record<string, string> = {
  order_created: "Заказ создан",
  order_change_status: "Статус изменён",
  order_assign_shipper: "Назначен отправщик",
  order_update_tracking: "Трек-номер обновлён",
  order_update_comment: "Комментарий обновлён",
  order_cancelled: "Заказ отменён",
  order_completed: "Заказ завершён",
  order_shipped: "Заказ отправлен",
  order_return_initiated: "Оформлен возврат",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  balance: "С баланса",
  card: "Перевод",
  deposit: "+ВАЙБ (в долг)",
  manual: "Создан вручную",
};

const REFUND_REASON_LABELS: Record<string, string> = {
  return_done: "возврат принят",
  send_by_expired: "дедлайн отправки истёк",
  cancelled_before_ship: "отмена до отправки",
  manual_credit: "ручной возврат владельца",
};

// Системные коды cancel_reason → по-человечески. Если владелец вписал
// причину текстом вручную — она уже человеческая, отдаём как есть.
const CANCEL_REASON_LABELS: Record<string, string> = {
  send_by_expired: "Истёк срок отправки",
  customer_cancelled: "Отменён клиентом",
  shipper_manual: "Отменён отправщиком",
  unpaid_timeout: "Не оплачен вовремя",
  owner_batch_cancel: "Отменён владельцем",
  cancelled_before_ship: "Отменён до отправки",
};

function cancelReasonLabel(reason: string): string {
  return CANCEL_REASON_LABELS[reason] ?? reason;
}

const FAULT_REASON_LABELS: Record<string, string> = {
  no_attempts: "не успели забрать в установленные дни",
  wrong_data: "неверные данные кода или трека",
  no_response: "не было ответа",
  late_report: "поздно оформили возврат",
};

function faultReasonLabel(reason: string | null): string | null {
  return reason ? (FAULT_REASON_LABELS[reason] ?? reason) : null;
}

function formatPrice(p: number): string {
  return `${Number(p).toLocaleString("ru-RU")} ₽`;
}

const SOURCE_LABELS: Record<string, string> = {
  drop: "Дропшиппер",
  avito: "Авито",
  manual: "Создан вручную",
};

// confirmed_by — кто подтвердил оплату. Бейдж показываем ТОЛЬКО когда он
// добавляет инфу (человек проверил): owner/director/partner. vision —
// отдельный 🤖-бейдж. balance и прочее НЕ показываем — способ оплаты уже
// виден в строке «Оплата» (бейдж лишь дублировал бы / путал).
const CONFIRMED_BY_LABELS: Record<string, string> = {
  owner: "✅ Подтвердил владелец",
  director: "✅ Подтвердил директор",
};

/**
 * Кнопка «Обновить код/штрихкод» — POST на refresh-detail.
 * Avito возвращает свежие значения (Avito регенерит deeplinks/коды).
 */
function AvitoRefreshButton({ avitoOrderId }: { avitoOrderId: string | null }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!avitoOrderId) return null;
  const onClick = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/avito/orders/${avitoOrderId}/refresh-detail`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || `Ошибка ${res.status}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["owner-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["owner-order"] });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={busy}>
      {busy ? "Обновляем…" : "🔄 Обновить код/штрихкод"}
    </Button>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const { data, isLoading, error, refetch } = useOwnerOrder(orderId);
  const updateOrder = useUpdateOwnerOrder();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);

  const [cancelReason, setCancelReason] = useState("");
  const [commentInput, setCommentInput] = useState("");
  // Есть ли чек по заказу — определяет раскладку строки «Чек + Комментарии».
  const [hasReceipt, setHasReceipt] = useState(false);

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить данные заказа"
          onRetry={refetch}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { order, product, client, shipper, partner, history } = data;
  const isUrgent =
    order.sendBy &&
    new Date(order.sendBy).getTime() - Date.now() < 24 * 60 * 60 * 1000 &&
    ["paid", "collecting"].includes(order.status);

  const handleCancel = async () => {
    try {
      await updateOrder.mutateAsync({
        orderId,
        action: "change_status",
        status: "cancelled",
        cancelReason: cancelReason || undefined,
      });
      setShowCancelModal(false);
      setCancelReason("");
    } catch {
      // Error shown via mutation state
    }
  };

  const handleUpdateComment = async () => {
    try {
      await updateOrder.mutateAsync({
        orderId,
        action: "update_comment",
        systemComment: commentInput,
      });
      setShowCommentModal(false);
    } catch {
      // Error shown via mutation state
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Back button */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Назад
        </button>
      </motion.div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center gap-4"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-white">Заказ #{order.orderNumber}</h1>
            <Badge variant={STATUS_VARIANTS[order.status as OrderStatus] || "default"}>
              {ORDER_STATUS_LABELS[order.status as OrderStatus] || order.status}
            </Badge>
            {isUrgent && (
              <span className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-red-500/20 to-red-500/10 border border-red-500/25 text-accent-red animate-pulse">
                Срочный
              </span>
            )}
            {order.source && (
              <span className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass text-white/60">
                {SOURCE_LABELS[order.source] || order.source}
              </span>
            )}
            {order.confirmedBy === "vision" && (
              <span
                className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-emerald-500/15 to-emerald-500/5 border border-emerald-500/25 text-emerald-200"
                title={
                  order.visionOperationId
                    ? `Vision auto-confirm. operation_id: ${order.visionOperationId}`
                    : "Vision auto-confirm (без operation_id)"
                }
              >
                🤖 Проверено Vision
              </span>
            )}
            {(order.confirmedBy === "owner" ||
              order.confirmedBy === "director" ||
              order.confirmedBy === "partner") && (
              <span
                className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass text-white/60"
                title={
                  order.confirmedBy === "partner" && partner?.tgUsername
                    ? `Подтвердил партнёр «${partner.name}» (@${partner.tgUsername})`
                    : undefined
                }
              >
                {order.confirmedBy === "partner"
                  ? `✅ Подтвердил партнёр${partner ? ` ${partner.name}` : ""}`
                  : CONFIRMED_BY_LABELS[order.confirmedBy]}
              </span>
            )}
            {order.status === "trash" && order.faultParty === "platform" && (
              <span
                className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-orange-500/20 to-orange-500/10 border border-orange-500/30 text-accent-orange"
                title={faultReasonLabel(order.faultReason) ?? undefined}
              >
                🟠 Наша вина — верни клиенту {formatPrice(order.clientPrice)}
              </span>
            )}
            {order.status === "trash" && order.faultParty === "client" && (
              <span
                className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-white/[0.06] to-white/[0.03] border border-glass text-white/60"
                title={faultReasonLabel(order.faultReason) ?? undefined}
              >
                ⚪ Вина клиента
              </span>
            )}
          </div>
          <p className="text-white/60">
            {DELIVERY_SERVICE_LABELS[order.deliveryService] || order.deliveryService}
            {order.trackingNumber && ` • ${order.trackingNumber}`}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {CANCELLABLE_STATUSES.includes(order.status) && (
            <Button variant="danger" size="sm" onClick={() => setShowCancelModal(true)}>
              Отменить заказ
            </Button>
          )}
        </div>
      </motion.div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order info card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Информация</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-white/40 mb-1">Статус</p>
                <Badge variant={STATUS_VARIANTS[order.status as OrderStatus] || "default"}>
                  {ORDER_STATUS_LABELS[order.status as OrderStatus] || order.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Доставка</p>
                <p className="text-white">
                  {DELIVERY_SERVICE_LABELS[order.deliveryService] || order.deliveryService}
                </p>
              </div>
              {order.dispatchCity && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Город отправки</p>
                  <p className="text-white">🏙️ {order.dispatchCity}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-white/40 mb-1">Дедлайн доставки</p>
                <p className={isUrgent ? "text-accent-red font-medium" : "text-white"}>
                  {order.sendBy
                    ? new Date(order.sendBy).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "не задано"}
                </p>
              </div>
              {order.trackingNumber && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Трек-номер</p>
                  <p className="text-white font-mono text-sm">{order.trackingNumber}</p>
                </div>
              )}
              {order.returnTrackingNumber && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Трек возврата</p>
                  <p className="text-white font-mono text-sm">{order.returnTrackingNumber}</p>
                </div>
              )}
              {order.pickupPointId && (
                <div>
                  <p className="text-xs text-white/40 mb-1">ПВЗ</p>
                  <p className="text-white/80 text-sm">{order.pickupPointId}</p>
                </div>
              )}

              {/* Avito — Отправка (код + штрихкод + срок + ПВЗ) */}
              {(order.avitoDispatchCode ||
                order.avitoDispatchBarcodeUrl ||
                order.avitoReturnTrack ||
                order.avitoReturnBarcodeUrl ||
                order.avitoOrderId) && (
                <div className="md:col-span-2 flex justify-end mt-2">
                  <AvitoRefreshButton avitoOrderId={order.avitoOrderId} />
                </div>
              )}
              {(order.avitoDispatchCode || order.avitoDispatchBarcodeUrl) && (
                <div className="md:col-span-2 mt-2 p-3 rounded-xl bg-accent-blue/10 border border-accent-blue/30">
                  <p className="text-xs text-accent-blue mb-2 font-semibold">📦 Отправка на Avito-ПВЗ</p>
                  {order.avitoDispatchCode && (
                    <p className="text-white font-mono text-2xl tracking-wider mb-1">
                      {order.avitoDispatchCode}
                    </p>
                  )}
                  <p className="text-xs text-white/50 mb-2">
                    Назовите этот номер или покажите штрихкод на ПВЗ.
                  </p>
                  {order.avitoDispatchBarcodeUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={order.avitoDispatchBarcodeUrl}
                      alt="Штрихкод отправки"
                      className="bg-white rounded-lg p-2 max-w-md w-full h-auto"
                    />
                  )}
                  {order.avitoSendTillText && (
                    <p className="text-sm text-white/70 mt-2">
                      Срок отправки: <span className="text-white">{order.avitoSendTillText}</span>
                    </p>
                  )}
                  {order.avitoDeliveryProviderName && (
                    <p className="text-sm text-white/70">
                      Куда нести: <span className="text-white">{order.avitoDeliveryProviderName}</span>
                    </p>
                  )}
                  {order.avitoDeliveryAddress && (
                    <p className="text-sm text-white/70">{order.avitoDeliveryAddress}</p>
                  )}
                </div>
              )}

              {/* Avito — Возврат */}
              {(order.avitoReturnTrack || order.avitoReturnBarcodeUrl) && (
                <div className="md:col-span-2 mt-2 p-3 rounded-xl bg-accent-orange/10 border border-accent-orange/30">
                  <p className="text-xs text-accent-orange mb-2 font-semibold">↩️ Возврат</p>
                  {order.avitoReturnTrack && (
                    <p className="text-white font-mono text-lg tracking-wider mb-1">
                      {order.avitoReturnTrack}
                    </p>
                  )}
                  {order.avitoReturnBarcodeUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={order.avitoReturnBarcodeUrl}
                      alt="Штрихкод возврата"
                      className="bg-white rounded-lg p-2 max-w-md w-full h-auto mt-2"
                    />
                  )}
                  {order.avitoReturnReceiveByText && (
                    <p className="text-sm text-white/70 mt-2">
                      Прибудет: <span className="text-white">{order.avitoReturnReceiveByText}</span>
                    </p>
                  )}
                  {order.avitoReturnDestroyByText && (
                    <p className="text-sm text-white/70">
                      Уничтожат после: <span className="text-white">{order.avitoReturnDestroyByText}</span>
                    </p>
                  )}
                  {order.avitoReturnProviderName && (
                    <p className="text-sm text-white/70">
                      Провайдер: <span className="text-white">{order.avitoReturnProviderName}</span>
                    </p>
                  )}
                  {order.avitoReturnConfirmCodeEnabled && (
                    <p className="text-xs text-accent-orange mt-1">⚠ Понадобится код подтверждения при выдаче</p>
                  )}
                  {order.avitoReturnTrackingUrl && (
                    <a
                      href={order.avitoReturnTrackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent-blue hover:underline mt-2 inline-block"
                    >
                      Отследить →
                    </a>
                  )}
                </div>
              )}
              <div>
                <p className="text-xs text-white/40 mb-1">Оплата</p>
                <p className={order.isPaid ? "text-accent-green" : "text-accent-orange"}>
                  {order.isPaid ? "Оплачен" : "Не оплачен"}
                  {(() => {
                    const applied = order.appliedBalance || 0;
                    const total = order.clientPrice;
                    const fmt = (n: number) => n.toLocaleString("ru-RU");
                    if (applied > 0 && applied < total) {
                      return ` • с баланса ${fmt(applied)} ₽ + перевод ${fmt(total - applied)} ₽`;
                    }
                    if (applied > 0 && total > 0) {
                      return ` • с баланса ${fmt(total)} ₽`;
                    }
                    const label = order.paymentMethod
                      ? PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod
                      : null;
                    return label ? ` • ${label}` : "";
                  })()}
                </p>
                {order.balanceRefund && (
                  <p className="text-accent-green text-sm mt-1">
                    ↩ Возвращено на баланс клиента: +
                    {order.balanceRefund.amount.toLocaleString("ru-RU")} ₽
                    <span className="text-white/40">
                      {" • "}
                      {new Date(order.balanceRefund.date).toLocaleDateString("ru-RU")}
                      {REFUND_REASON_LABELS[order.balanceRefund.reason]
                        ? ` • ${REFUND_REASON_LABELS[order.balanceRefund.reason]}`
                        : ""}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Создан</p>
                <p className="text-white">{new Date(order.createdAt).toLocaleString("ru-RU")}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Таймлайн логистики (ТЗ §8.3) — рендерится для всех, но Avito
            показывает дополнительные точки (delivered, return_in_transit). */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <LogisticsTimeline
            order={{
              source: order.source ?? null,
              status: order.status ?? null,
              paid_at: order.paidAt,
              sent_at: order.shippedAt,
              delivered_at: order.deliveredAt ?? null,
              return_initiated_at: order.returnInitiatedAt ?? null,
              return_arrived_at: order.returnArrivedAt ?? null,
              return_completed_at: order.returnCompletedAt ?? null,
            }}
          />
        </motion.div>

        {/* Финансы заказа card (товар + зафиксированные цены заказа) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Финансы заказа</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              {product ? (
                <>
                  <Link
                    href={`/owner/products/${product.id}`}
                    className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/[0.08] flex-shrink-0">
                      {product.photo ? (
                        <img
                          src={product.photo}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg
                            className="w-5 h-5 text-white/40"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-white">{product.name}</p>
                    </div>
                  </Link>
                  {order.size && (
                    <div>
                      <p className="text-xs text-white/40 mb-1">Размер</p>
                      <p className="text-white">{order.size}</p>
                    </div>
                  )}
                  {/* Цены — снимок заказа (зафиксированы при оформлении,
                      не меняются при правке цены товара). */}
                  <div>
                    <p className="text-xs text-white/40 mb-1">Дроп-цена</p>
                    <p className="text-white">{order.clientPrice.toLocaleString("ru-RU")} ₽</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Закупочная</p>
                    <p className="text-white/60">{order.purchasePrice.toLocaleString("ru-RU")} ₽</p>
                  </div>
                  <div className="pt-2 border-t border-glass">
                    <p className="text-xs text-white/40 mb-1">Прибыль (ROI)</p>
                    {(() => {
                      const margin = order.clientPrice - order.purchasePrice;
                      const roi =
                        order.purchasePrice > 0
                          ? Math.round((margin / order.purchasePrice) * 100)
                          : 0;
                      return (
                        <p
                          className={`text-lg font-bold ${margin >= 0 ? "text-accent-green" : "text-accent-red"}`}
                        >
                          {margin >= 0 ? "+" : ""}
                          {margin.toLocaleString("ru-RU")} ₽
                          <span className="text-sm font-normal text-white/40 ml-1">
                            ({roi > 0 ? "+" : ""}
                            {roi}%)
                          </span>
                        </p>
                      );
                    })()}
                  </div>
                </>
              ) : (
                <p className="text-white/60">Товар не найден</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Чек оплаты + Комментарии в одном ряду. Нет чека → комментарии на всю ширину. */}
      <div className={hasReceipt ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : undefined}>
        <motion.div
          className="h-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <OrderPaymentReview orderId={order.id} onLoaded={setHasReceipt} />
        </motion.div>
        <motion.div
          className="h-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="font-semibold text-white">Комментарии</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCommentInput(order.systemComment || "");
                  setShowCommentModal(true);
                }}
              >
                Редактировать
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.clientComment && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Комментарий клиента</p>
                  <p className="text-white/80 text-sm">{order.clientComment}</p>
                </div>
              )}
              {order.systemComment && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Системный комментарий</p>
                  <p className="text-white/80 text-sm">{order.systemComment}</p>
                </div>
              )}
              {order.problemType && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Тип проблемы</p>
                  <p className="text-accent-orange text-sm font-medium">
                    {order.problemType === "out_of_stock"
                      ? "Нет в наличии"
                      : order.problemType === "bad_barcode"
                        ? "Трек не сканируется"
                        : order.problemType}
                  </p>
                </div>
              )}
              {order.cancelReason && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Причина отмены</p>
                  <p className="text-accent-red text-sm">{cancelReasonLabel(order.cancelReason)}</p>
                </div>
              )}
              {!order.clientComment &&
                !order.systemComment &&
                !order.cancelReason &&
                !order.problemType && (
                  <p className="text-white/40 text-center py-2">Нет комментариев</p>
                )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Клиент</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              {client ? (
                <>
                  <Link
                    href={`/owner/clients/${client.id}`}
                    className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-b from-blue-500/30 to-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                      <span className="text-accent-blue font-medium">
                        {(client.telegramUsername || client.name || "U").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        @{client.telegramUsername || "unknown"}
                      </p>
                      <p className="text-xs text-white/60">{client.name || "Без имени"}</p>
                    </div>
                  </Link>
                  {client.isVibePlus && (
                    <div className="flex gap-2 flex-wrap">
                      <span className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-orange-500/20 to-orange-500/10 border border-orange-500/25 text-accent-orange">
                        +ВАЙБ
                      </span>
                    </div>
                  )}
                  {client.phone && (
                    <div>
                      <p className="text-xs text-white/40 mb-1">Телефон</p>
                      <p className="text-white/80">{client.phone}</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-white/60">Клиент не найден</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Partner card — показывается только для партнёрских заказов */}
        {partner && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42 }}
          >
            <Card className="h-full">
              <CardHeader>
                <h3 className="font-semibold text-white">Партнёр</h3>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link
                  href={`/owner/partners/${partner.id}`}
                  className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-b from-purple-500/30 to-purple-500/15 border border-purple-500/20 flex items-center justify-center">
                    <span className="text-accent-purple font-medium">🤝</span>
                  </div>
                  <div>
                    <p className="font-medium text-white">{partner.name}</p>
                    {partner.tgUsername && (
                      <p className="text-xs text-white/60">@{partner.tgUsername}</p>
                    )}
                  </div>
                </Link>
                {partner.commissionSnapshot != null && (
                  <div>
                    <p className="text-xs text-white/40 mb-1">Комиссия за заказ</p>
                    <p className="text-white/80">
                      {partner.commissionSnapshot.toLocaleString("ru-RU")} ₽
                    </p>
                  </div>
                )}
                {!partner.isLinked && (
                  <p className="text-xs text-accent-orange">⚠️ Партнёр не привязан к Telegram</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Shipper card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Отправщик</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              {shipper ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-b from-purple-500/30 to-purple-500/15 border border-purple-500/20 flex items-center justify-center">
                      <span className="text-accent-purple font-medium">
                        {(shipper.name || "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-white">{shipper.name}</p>
                      {shipper.telegramUsername && (
                        <p className="text-xs text-white/60">@{shipper.telegramUsername}</p>
                      )}
                    </div>
                  </div>
                  {order.shippedAt && (
                    <div>
                      <p className="text-xs text-white/40 mb-1">Отправлен</p>
                      <p className="text-white">
                        {new Date(order.shippedAt).toLocaleString("ru-RU")}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-white/60">Ещё не отправлен</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
      >
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">История</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Key dates from order */}
              {order.completedAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-green-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-white">Заказ завершён</p>
                    <p className="text-xs text-white/40">
                      {new Date(order.completedAt).toLocaleString("ru-RU")}
                    </p>
                  </div>
                </div>
              )}
              {order.cancelledAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-white">Заказ отменён</p>
                    {order.cancelReason && (
                      <p className="text-xs text-white/60">
                        {cancelReasonLabel(order.cancelReason)}
                      </p>
                    )}
                    <p className="text-xs text-white/40">
                      {new Date(order.cancelledAt).toLocaleString("ru-RU")}
                    </p>
                  </div>
                </div>
              )}
              {order.shippedAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-cyan-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-white">Отправлен</p>
                    <p className="text-xs text-white/40">
                      {new Date(order.shippedAt).toLocaleString("ru-RU")}
                    </p>
                  </div>
                </div>
              )}
              {order.paidAt && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-white">Оплачен</p>
                    <p className="text-xs text-white/40">
                      {new Date(order.paidAt).toLocaleString("ru-RU")}
                    </p>
                  </div>
                </div>
              )}

              {/* Activity log */}
              {history.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-white/30 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-white">
                      {ACTION_LABELS[entry.action] || entry.action}
                    </p>
                    <p className="text-xs text-white/40">
                      {new Date(entry.createdAt).toLocaleString("ru-RU")}
                    </p>
                  </div>
                </div>
              ))}

              {/* Created */}
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 mt-2 rounded-full bg-white/50 flex-shrink-0" />
                <div>
                  <p className="text-sm text-white">Заказ создан</p>
                  <p className="text-xs text-white/40">
                    {new Date(order.createdAt).toLocaleString("ru-RU")}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Cancel order modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Отменить заказ?"
      >
        <div className="space-y-4">
          <p className="text-white/80">
            Вы уверены, что хотите отменить заказ{" "}
            <span className="text-white font-medium">#{order.orderNumber}</span>? Это действие
            нельзя отменить.
          </p>

          <Input
            label="Причина отмены"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Укажите причину..."
          />

          {updateOrder.isError && (
            <p className="text-sm text-accent-red">
              {updateOrder.error instanceof Error ? updateOrder.error.message : "Ошибка обновления"}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCancelModal(false)} className="flex-1">
              Назад
            </Button>
            <Button
              variant="danger"
              onClick={handleCancel}
              isLoading={updateOrder.isPending}
              className="flex-1"
            >
              Отменить заказ
            </Button>
          </div>
        </div>
      </Modal>

      {/* Comment modal */}
      <Modal
        isOpen={showCommentModal}
        onClose={() => setShowCommentModal(false)}
        title="Системный комментарий"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">Комментарий</label>
            <textarea
              className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-glass text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-accent-blue resize-none"
              rows={4}
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder="Введите комментарий..."
            />
          </div>

          {updateOrder.isError && (
            <p className="text-sm text-accent-red">
              {updateOrder.error instanceof Error ? updateOrder.error.message : "Ошибка обновления"}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCommentModal(false)} className="flex-1">
              Отмена
            </Button>
            <Button
              onClick={handleUpdateComment}
              isLoading={updateOrder.isPending}
              className="flex-1"
            >
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
