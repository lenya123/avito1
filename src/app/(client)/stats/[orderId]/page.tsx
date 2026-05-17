"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  useOrder,
  useUpdateOrder,
  getOrderStatusColor,
  getOrderStatusLabel,
  type OrderStatus,
} from "@/hooks/use-orders";
import { formatPrice } from "@/utils/pricing";
import { cn } from "@/utils/cn";
import { OrderTimeline, type TimelineEvent } from "@/components/client/order-timeline";
import { Button, Card, CardContent, Spinner, Modal, Input, BarcodeDisplay } from "@/components/ui";
import { STATUS_HEX_COLORS } from "@/lib/constants/status-colors";

// Статусы с пульсацией (активные)
const BLINKING_STATUSES: OrderStatus[] = [
  "awaiting_shipment",
  "collecting",
  "in_transit",
  "return_in_transit",
  "return_arrived",
];

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId as string;

  const { data: orderData, isLoading: orderLoading, error: orderError } = useOrder(orderId);
  const updateOrder = useUpdateOrder();

  // Модальные окна
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [showReturnCodeModal, setShowReturnCodeModal] = useState(false);
  const [showReturnDeadlineModal, setShowReturnDeadlineModal] = useState(false);
  const [showSalePriceModal, setShowSalePriceModal] = useState(false);
  const [showRestoreFromTrashModal, setShowRestoreFromTrashModal] = useState(false);

  // Формы
  const [salePrice, setSalePrice] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newTrackNumber, setNewTrackNumber] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [returnCode, setReturnCode] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [returnTrackingNumber, setReturnTrackingNumber] = useState("");
  const [returnDeadlineDate, setReturnDeadlineDate] = useState("");

  // Формируем timeline из реальной истории статусов
  const timelineEvents = useMemo((): TimelineEvent[] => {
    if (!orderData?.order) return [];

    const order = orderData.order;

    // Используем status_history из БД (реальные даты)
    if (
      order.status_history &&
      Array.isArray(order.status_history) &&
      order.status_history.length > 0
    ) {
      return order.status_history.map((entry: { status: string; timestamp: string }) => ({
        status: entry.status as OrderStatus,
        timestamp: entry.timestamp,
      }));
    }

    // Fallback для старых заказов без status_history — показываем только текущий статус
    return [
      {
        status: (order.status || "awaiting_shipment") as OrderStatus,
        timestamp: order.created_at,
      },
    ];
  }, [orderData]);

  // Handlers
  const handleCancel = useCallback(async () => {
    if (!orderId) return;

    try {
      await updateOrder.mutateAsync({
        orderId,
        input: {
          cancel: true,
          cancelReason: cancelReason || "Отменён клиентом",
        },
      });
      setShowCancelModal(false);
      setCancelReason("");
    } catch (error) {
      console.error("Cancel error:", error);
    }
  }, [orderId, cancelReason, updateOrder]);

  const handleComplete = useCallback(async () => {
    if (!orderId) return;

    try {
      await updateOrder.mutateAsync({
        orderId,
        input: {
          complete: true,
        },
      });
      setShowCompleteModal(false);
    } catch (error) {
      console.error("Complete error:", error);
    }
  }, [orderId, updateOrder]);

  const handleRefund = useCallback(async () => {
    if (!orderId || !expectedReturnDate) return;

    try {
      await updateOrder.mutateAsync({
        orderId,
        input: {
          initiateReturn: true,
          expectedReturnDate,
          ...(returnTrackingNumber ? { returnTrackingNumber } : {}),
        },
      });
      setShowRefundModal(false);
      setExpectedReturnDate("");
      setReturnTrackingNumber("");
    } catch (error) {
      console.error("Refund error:", error);
    }
  }, [orderId, expectedReturnDate, returnTrackingNumber, updateOrder]);

  // Изменить размер
  const handleChangeSize = useCallback(async () => {
    if (!orderId || !newSize) return;

    try {
      await updateOrder.mutateAsync({
        orderId,
        input: {
          productSizeId: newSize,
        },
      });
      setShowSizeModal(false);
      setNewSize("");
    } catch (error) {
      console.error("Change size error:", error);
    }
  }, [orderId, newSize, updateOrder]);

  // Изменить трек-номер
  const handleChangeTrackNumber = useCallback(async () => {
    if (!orderId || !newTrackNumber) return;

    try {
      await updateOrder.mutateAsync({
        orderId,
        input: {
          trackingNumber: newTrackNumber,
        },
      });
      setShowBarcodeModal(false);
      setNewTrackNumber("");
    } catch (error) {
      console.error("Change track number error:", error);
    }
  }, [orderId, newTrackNumber, updateOrder]);

  // Продлить дедлайн
  const handleExtendDeadline = useCallback(async () => {
    if (!orderId || !newDeadline) return;

    try {
      await updateOrder.mutateAsync({
        orderId,
        input: {
          deliveryDeadline: newDeadline,
        },
      });
      setShowDeadlineModal(false);
      setNewDeadline("");
    } catch (error) {
      console.error("Extend deadline error:", error);
    }
  }, [orderId, newDeadline, updateOrder]);

  // Указать код возврата
  const handleSetReturnCode = useCallback(async () => {
    if (!orderId || !returnCode) return;

    try {
      await updateOrder.mutateAsync({
        orderId,
        input: {
          returnCode,
        },
      });
      setShowReturnCodeModal(false);
      setReturnCode("");
    } catch (error) {
      console.error("Set return code error:", error);
    }
  }, [orderId, returnCode, updateOrder]);

  // Продлить срок забора возврата
  const handleExtendReturnDeadline = useCallback(async () => {
    if (!orderId || !returnDeadlineDate) return;

    try {
      await updateOrder.mutateAsync({
        orderId,
        input: {
          returnDeadline: returnDeadlineDate,
        },
      });
      setShowReturnDeadlineModal(false);
      setReturnDeadlineDate("");
    } catch (error) {
      console.error("Extend return deadline error:", error);
    }
  }, [orderId, returnDeadlineDate, updateOrder]);

  // Изменить цену продажи (без завершения)
  const handleChangeSalePrice = useCallback(async () => {
    if (!orderId || !salePrice) return;

    try {
      await updateOrder.mutateAsync({
        orderId,
        input: {
          salePrice: parseFloat(salePrice),
        },
      });
      setShowSalePriceModal(false);
      setSalePrice("");
    } catch (error) {
      console.error("Change sale price error:", error);
    }
  }, [orderId, salePrice, updateOrder]);

  // Восстановление из утиля
  const handleRestoreFromTrash = useCallback(async () => {
    if (!orderId || !expectedReturnDate) return;

    try {
      await updateOrder.mutateAsync({
        orderId,
        input: {
          restoreFromTrash: true,
          expectedReturnDate,
          ...(returnTrackingNumber ? { returnTrackingNumber } : {}),
        },
      });
      setShowRestoreFromTrashModal(false);
      setExpectedReturnDate("");
      setReturnTrackingNumber("");
    } catch (error) {
      console.error("Restore from trash error:", error);
    }
  }, [orderId, expectedReturnDate, returnTrackingNumber, updateOrder]);

  // Loading state
  if (orderLoading) {
    return (
      <main className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </main>
    );
  }

  // Error state
  if (orderError || !orderData?.order) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-center py-12">
          <p className="text-white/60 mb-4">Заказ не найден</p>
          <Button onClick={() => router.push("/stats")}>Вернуться к списку</Button>
        </div>
      </main>
    );
  }

  const order = orderData.order;
  const allowedActions = orderData.allowedActions || {};
  const product = order.product;

  // Статус для отображения
  const status = order.status as OrderStatus;
  const isBlinking = BLINKING_STATUSES.includes(status);
  const statusColorKey = getOrderStatusColor(status);
  const statusLabel = getOrderStatusLabel(status);
  const statusHexColor = STATUS_HEX_COLORS[statusColorKey] || "rgba(255, 255, 255, 0.5)";

  // Auto-tracked: API-заказы (СДЭК, Почта, 5Post)
  const isAutoTracked = allowedActions.isAutoTracked || false;

  // Проверяем есть ли какие-либо действия
  const hasAnyActions =
    allowedActions.canCancel ||
    allowedActions.canComplete ||
    allowedActions.canInitiateReturn ||
    allowedActions.canChangeSize ||
    allowedActions.canChangeBarcode ||
    allowedActions.canChangeDeadline ||
    allowedActions.canChangeSalePrice ||
    allowedActions.canSetReturnCode ||
    allowedActions.canExtendReturnDeadline ||
    allowedActions.canRestoreFromTrash;

  // Расчёт прибыли
  const profit = order.sale_price ? order.sale_price - order.client_price : null;
  const profitPercent =
    profit && order.sale_price ? Math.round((profit / order.sale_price) * 100) : null;

  return (
    <>
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Кнопка назад */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => router.push("/stats")}
          className="flex items-center gap-2 min-h-[44px] mb-4 text-white/60 hover:text-white/80 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span className="text-sm">Назад</span>
        </motion.button>

        {/* Заголовок */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between mb-6"
        >
          <div>
            <h1 className="text-2xl font-bold text-white">Заказ #{order.order_number}</h1>
            <p className="text-sm text-white/40 mt-1">
              {new Date(order.created_at).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-xl",
              "bg-gradient-to-br from-white/[0.12] to-white/[0.06]",
              "border border-glass",
              "shadow-glass-inset"
            )}
          >
            <span
              className={cn("w-2 h-2 rounded-full flex-shrink-0", isBlinking && "animate-pulse")}
              style={{
                background: statusHexColor,
                boxShadow: `0 0 6px 0 ${statusHexColor}`,
              }}
            />
            <span className="text-sm font-medium" style={{ color: statusHexColor }}>
              {statusLabel}
            </span>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Левая колонка — Товар и цены */}
          <div className="space-y-4">
            {/* Карточка товара */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card padding="none">
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {/* Фото */}
                    <div
                      className={cn(
                        "relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0",
                        "bg-gradient-to-br from-white/[0.1] to-white/[0.05]",
                        "border border-glass-subtle",
                        "shadow-glass-sm"
                      )}
                    >
                      {product?.photo_urls?.[0] ? (
                        <Image
                          src={product.photo_urls[0]}
                          alt={product.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/20">
                          <svg
                            className="w-8 h-8"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Информация */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white truncate">
                        {product?.name || "Товар"}
                      </h3>
                      {product?.brand && <p className="text-sm text-white/40">{product.brand}</p>}
                      <div className="mt-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-medium",
                            "bg-gradient-to-br from-white/[0.12] to-white/[0.06]",
                            "border border-glass-subtle",
                            "text-white"
                          )}
                        >
                          Размер: {order.size}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Цены */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <Card padding="none" hideHighlight>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-white mb-4">Финансы</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60">Ваша цена</span>
                      <span className="text-white font-semibold">
                        {formatPrice(order.client_price)}
                      </span>
                    </div>

                    {order.sale_price && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-white/60">Цена продажи</span>
                          <span className="text-white/60">{formatPrice(order.sale_price)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-white/60">Ваша прибыль</span>
                          <span
                            className={cn(
                              "font-semibold",
                              profit && profit > 0 ? "text-accent-green" : "text-accent-red"
                            )}
                          >
                            {profit && profit > 0 ? "+" : ""}
                            {formatPrice(profit || 0)}
                            {profitPercent !== null && (
                              <span className="text-xs opacity-70 ml-1">({profitPercent}%)</span>
                            )}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Доставка */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card padding="none">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-white mb-4">Доставка</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60">Служба</span>
                      <span className="text-white capitalize font-medium">
                        {order.delivery_service}
                      </span>
                    </div>
                    {["awaiting_shipment", "collecting"].includes(status) &&
                      order.delivery_deadline && (
                        <div className="flex justify-between items-center">
                          <span className="text-white/60">Дедлайн отправки</span>
                          <span className="text-white font-medium">
                            {new Date(order.delivery_deadline).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                      )}
                    {status === "return_arrived" && order.trash_deadline && (
                      <div className="flex justify-between items-center">
                        <span className="text-white/60">Забрать до</span>
                        <span className="text-accent-orange font-medium">
                          {new Date(order.trash_deadline).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                    )}
                    {order.tracking_number && (
                      <div className="flex justify-between items-center">
                        <span className="text-white/60">Трек-номер</span>
                        <span
                          className={cn(
                            "font-mono text-sm px-2 py-1 rounded-xl",
                            "bg-white/[0.06]",
                            "text-white"
                          )}
                        >
                          {order.tracking_number}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Комментарий */}
            {order.client_comment && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Card padding="none">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-white mb-3">Комментарий</h3>
                    <p
                      className={cn(
                        "text-sm text-white/60 p-3 rounded-xl",
                        "bg-white/[0.04]",
                        "border border-glass-subtle"
                      )}
                    >
                      {order.client_comment}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          {/* Правая колонка — Timeline и действия */}
          <div className="space-y-4">
            {/* Timeline */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <Card padding="none">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-white mb-4">История заказа</h3>
                  <OrderTimeline
                    events={timelineEvents}
                    currentStatus={order.status as OrderStatus}
                  />
                </CardContent>
              </Card>
            </motion.div>

            {/* Баннер автотрекинга */}
            {isAutoTracked && ["in_transit", "return_in_transit"].includes(status) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-2xl",
                    "bg-gradient-to-br from-accent-blue/10 to-accent-blue/5",
                    "border border-accent-blue/20"
                  )}
                >
                  <svg
                    className="w-5 h-5 text-accent-blue flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="text-sm text-white/80">Статус обновляется автоматически</span>
                </div>
              </motion.div>
            )}

            {/* Баннер bad_barcode */}
            {status === "problem" && order.problem_type === "bad_barcode" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-2xl",
                    "bg-gradient-to-br from-accent-orange/10 to-accent-orange/5",
                    "border border-accent-orange/20"
                  )}
                >
                  <svg
                    className="w-5 h-5 text-accent-orange flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-accent-orange">
                      Штрихкод не считывается
                    </p>
                    <p className="text-xs text-white/60 mt-1">
                      Обновите трек-номер или отмените заказ
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Действия */}
            {hasAnyActions && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Card padding="none">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-white mb-4">Действия</h3>
                    <div className="space-y-3">
                      {/* Основные действия */}
                      {allowedActions.canComplete && (
                        <Button className="w-full" onClick={() => setShowCompleteModal(true)}>
                          {isAutoTracked ? "Завершить вручную" : "Завершить заказ"}
                        </Button>
                      )}

                      {allowedActions.canChangeSalePrice && (
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => setShowSalePriceModal(true)}
                        >
                          Изменить цену продажи
                        </Button>
                      )}

                      {allowedActions.canInitiateReturn && (
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => setShowRefundModal(true)}
                        >
                          Оформить возврат
                        </Button>
                      )}

                      {/* Продление срока забора возврата */}
                      {allowedActions.canExtendReturnDeadline && (
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => setShowReturnDeadlineModal(true)}
                        >
                          Продлить срок забора
                        </Button>
                      )}

                      {/* Редактирование заказа */}
                      {allowedActions.canChangeSize && (
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => setShowSizeModal(true)}
                        >
                          Изменить размер
                        </Button>
                      )}

                      {allowedActions.canChangeBarcode && (
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => setShowBarcodeModal(true)}
                        >
                          Изменить трек-номер
                        </Button>
                      )}

                      {allowedActions.canChangeDeadline && (
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => setShowDeadlineModal(true)}
                        >
                          Продлить дедлайн
                        </Button>
                      )}

                      {/* Код возврата */}
                      {allowedActions.canSetReturnCode && (
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => setShowReturnCodeModal(true)}
                        >
                          Указать код возврата
                        </Button>
                      )}

                      {/* Восстановление из утиля */}
                      {allowedActions.canRestoreFromTrash && (
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => setShowRestoreFromTrashModal(true)}
                        >
                          Возврат отправлен на ПВЗ
                        </Button>
                      )}

                      {/* Отмена */}
                      {allowedActions.canCancel && (
                        <Button
                          variant="danger"
                          className="w-full"
                          onClick={() => setShowCancelModal(true)}
                        >
                          Отменить заказ
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </main>

      {/* Модал отмены */}
      <AnimatePresence>
        {showCancelModal && (
          <Modal
            isOpen={showCancelModal}
            onClose={() => setShowCancelModal(false)}
            title="Отменить заказ"
          >
            <div className="space-y-4">
              <p className="text-white/60">
                Вы уверены, что хотите отменить заказ #{order.order_number}? Средства будут
                возвращены на депозит.
              </p>
              <Input
                label="Причина отмены (опционально)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Например: передумал"
              />
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setShowCancelModal(false)}
                >
                  Отмена
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={handleCancel}
                  isLoading={updateOrder.isPending}
                >
                  Отменить заказ
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Модал завершения */}
      <AnimatePresence>
        {showCompleteModal && (
          <Modal
            isOpen={showCompleteModal}
            onClose={() => setShowCompleteModal(false)}
            title="Завершить заказ"
          >
            <div className="space-y-4">
              <p className="text-white/60">Покупатель получил заказ #{order.order_number}?</p>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setShowCompleteModal(false)}
                >
                  Отменить
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleComplete}
                  isLoading={updateOrder.isPending}
                >
                  Подтвердить
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Модал изменения цены продажи */}
      <AnimatePresence>
        {showSalePriceModal && (
          <Modal
            isOpen={showSalePriceModal}
            onClose={() => setShowSalePriceModal(false)}
            title="Изменить цену продажи"
          >
            <div className="space-y-4">
              <Input
                label="Цена продажи"
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="0"
                hint={`Ваша цена: ${formatPrice(order.client_price)}`}
              />
              {salePrice && parseFloat(salePrice) > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "p-3 rounded-xl",
                    "bg-gradient-to-br from-white/[0.08] to-white/[0.04]",
                    "border border-glass-subtle"
                  )}
                >
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Ваша прибыль</span>
                    <span
                      className={
                        parseFloat(salePrice) > order.client_price
                          ? "text-accent-green"
                          : "text-accent-red"
                      }
                    >
                      {parseFloat(salePrice) > order.client_price ? "+" : ""}
                      {formatPrice(parseFloat(salePrice) - order.client_price)}
                    </span>
                  </div>
                </motion.div>
              )}
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowSalePriceModal(false);
                    setSalePrice("");
                  }}
                >
                  Отмена
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleChangeSalePrice}
                  isLoading={updateOrder.isPending}
                  disabled={!salePrice || parseFloat(salePrice) <= 0}
                >
                  Сохранить
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Модал возврата (только ручные заказы) */}
      <AnimatePresence>
        {showRefundModal && (
          <Modal
            isOpen={showRefundModal}
            onClose={() => setShowRefundModal(false)}
            title="Оформить возврат"
          >
            <div className="space-y-4">
              <p className="text-white/60">
                {order.status === "completed"
                  ? "Укажите трек-номер нового отправления и дату прибытия на ПВЗ."
                  : "Укажите ожидаемую дату прибытия возврата на ПВЗ."}
              </p>

              {/* Трек-номер: обязателен для completed (все службы), опционален для Avito in_transit */}
              {(order.status === "completed" || order.delivery_service === "avito") && (
                <Input
                  label={
                    order.status === "completed"
                      ? "Трек-номер возврата *"
                      : "Новый трек-номер возврата"
                  }
                  value={returnTrackingNumber}
                  onChange={(e) => setReturnTrackingNumber(e.target.value)}
                  placeholder="Трек-номер отправления"
                />
              )}

              <Input
                label="Ожидаемая дата прибытия"
                type="date"
                value={expectedReturnDate}
                onChange={(e) => setExpectedReturnDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />

              {returnTrackingNumber.length >= 3 && (
                <BarcodeDisplay value={returnTrackingNumber} height={60} />
              )}

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowRefundModal(false);
                    setExpectedReturnDate("");
                    setReturnTrackingNumber("");
                  }}
                >
                  Отмена
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleRefund}
                  isLoading={updateOrder.isPending}
                  disabled={
                    !expectedReturnDate ||
                    (order.status === "completed" && !returnTrackingNumber) ||
                    (order.delivery_service === "avito" && !returnTrackingNumber)
                  }
                >
                  Оформить возврат
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Модал изменения размера */}
      <AnimatePresence>
        {showSizeModal && (
          <Modal
            isOpen={showSizeModal}
            onClose={() => setShowSizeModal(false)}
            title="Изменить размер"
          >
            <div className="space-y-4">
              <p className="text-white/60">Выберите новый размер из доступных.</p>
              <div className="space-y-2">
                {product?.sizes?.map(
                  (sizeOption: { id: string; size: string; available: number }) => (
                    <button
                      key={sizeOption.id}
                      onClick={() => setNewSize(sizeOption.id)}
                      disabled={sizeOption.available === 0 || sizeOption.size === order.size}
                      className={cn(
                        "w-full p-3 rounded-xl text-left transition-all",
                        "border",
                        newSize === sizeOption.id
                          ? "bg-accent-blue/20 border-accent-blue/50 text-white"
                          : sizeOption.available === 0 || sizeOption.size === order.size
                            ? "bg-white/[0.02] border-glass-subtle text-white/20 cursor-not-allowed"
                            : "bg-white/[0.04] border-glass hover:bg-white/[0.08] text-white"
                      )}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{sizeOption.size}</span>
                        <span className="text-sm text-white/40">
                          {sizeOption.size === order.size
                            ? "Текущий"
                            : sizeOption.available === 0
                              ? "Нет в наличии"
                              : `В наличии: ${sizeOption.available}`}
                        </span>
                      </div>
                    </button>
                  )
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowSizeModal(false);
                    setNewSize("");
                  }}
                >
                  Отмена
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleChangeSize}
                  isLoading={updateOrder.isPending}
                  disabled={!newSize}
                >
                  Изменить размер
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Модал изменения трек-номера */}
      <AnimatePresence>
        {showBarcodeModal && (
          <Modal
            isOpen={showBarcodeModal}
            onClose={() => setShowBarcodeModal(false)}
            title="Изменить трек-номер"
          >
            <div className="space-y-4">
              <p className="text-white/60">
                Введите новый трек-номер. Штрихкод сгенерируется автоматически.
              </p>
              <Input
                label="Новый трек-номер"
                value={newTrackNumber}
                onChange={(e) => setNewTrackNumber(e.target.value)}
                placeholder="Введите трек-номер"
              />
              {newTrackNumber.length >= 3 && <BarcodeDisplay value={newTrackNumber} height={60} />}
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowBarcodeModal(false);
                    setNewTrackNumber("");
                  }}
                >
                  Отмена
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleChangeTrackNumber}
                  isLoading={updateOrder.isPending}
                  disabled={!newTrackNumber}
                >
                  Сохранить
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Модал продления дедлайна */}
      <AnimatePresence>
        {showDeadlineModal && (
          <Modal
            isOpen={showDeadlineModal}
            onClose={() => setShowDeadlineModal(false)}
            title="Продлить дедлайн"
          >
            <div className="space-y-4">
              <p className="text-white/60">
                Укажите новую дату дедлайна. Максимум +5 дней от текущего.
              </p>
              <div className={cn("p-3 rounded-xl", "bg-white/[0.04] border border-glass-subtle")}>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Текущий дедлайн</span>
                  <span className="text-white">
                    {order.delivery_deadline
                      ? new Date(order.delivery_deadline).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "long",
                        })
                      : "—"}
                  </span>
                </div>
              </div>
              <Input
                label="Новый дедлайн"
                type="date"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
                min={
                  order.delivery_deadline
                    ? new Date(order.delivery_deadline).toISOString().split("T")[0]
                    : undefined
                }
                max={
                  order.delivery_deadline
                    ? (() => {
                        const maxDate = new Date(order.delivery_deadline);
                        maxDate.setDate(maxDate.getDate() + 5);
                        return maxDate.toISOString().split("T")[0];
                      })()
                    : undefined
                }
              />
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowDeadlineModal(false);
                    setNewDeadline("");
                  }}
                >
                  Отмена
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleExtendDeadline}
                  isLoading={updateOrder.isPending}
                  disabled={!newDeadline}
                >
                  Продлить
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Модал указания кода возврата */}
      <AnimatePresence>
        {showReturnCodeModal && (
          <Modal
            isOpen={showReturnCodeModal}
            onClose={() => setShowReturnCodeModal(false)}
            title="Указать код возврата"
          >
            <div className="space-y-4">
              <p className="text-white/60">
                Введите код для получения возврата на ПВЗ. Код обновляется ежедневно.
              </p>
              <Input
                label="Код возврата"
                value={returnCode}
                onChange={(e) => setReturnCode(e.target.value)}
                placeholder="Введите код"
              />
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowReturnCodeModal(false);
                    setReturnCode("");
                  }}
                >
                  Отмена
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSetReturnCode}
                  isLoading={updateOrder.isPending}
                  disabled={!returnCode.trim()}
                >
                  Сохранить
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Модал продления срока забора возврата */}
      <AnimatePresence>
        {showReturnDeadlineModal && (
          <Modal
            isOpen={showReturnDeadlineModal}
            onClose={() => setShowReturnDeadlineModal(false)}
            title="Продлить срок забора"
          >
            <div className="space-y-4">
              <p className="text-white/60">
                Укажите новую дату, до которой нужно забрать возврат с ПВЗ.
              </p>
              {order.trash_deadline && (
                <div className={cn("p-3 rounded-xl", "bg-white/[0.04] border border-glass-subtle")}>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Текущий дедлайн</span>
                    <span className="text-white">
                      {new Date(order.trash_deadline).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "long",
                      })}
                    </span>
                  </div>
                </div>
              )}
              <Input
                label="Новая дата забора"
                type="date"
                value={returnDeadlineDate}
                onChange={(e) => setReturnDeadlineDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowReturnDeadlineModal(false);
                    setReturnDeadlineDate("");
                  }}
                >
                  Отмена
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleExtendReturnDeadline}
                  isLoading={updateOrder.isPending}
                  disabled={!returnDeadlineDate}
                >
                  Продлить
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Модал восстановления из утиля */}
      <AnimatePresence>
        {showRestoreFromTrashModal && (
          <Modal
            isOpen={showRestoreFromTrashModal}
            onClose={() => setShowRestoreFromTrashModal(false)}
            title="Возврат отправлен на ПВЗ"
          >
            <div className="space-y-4">
              <p className="text-white/60">
                Укажите новый трек-номер и ожидаемую дату прибытия на ПВЗ.
              </p>

              <Input
                label="Трек-номер возврата"
                value={returnTrackingNumber}
                onChange={(e) => setReturnTrackingNumber(e.target.value)}
                placeholder="Трек-номер отправления"
              />

              <Input
                label="Ожидаемая дата прибытия"
                type="date"
                value={expectedReturnDate}
                onChange={(e) => setExpectedReturnDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowRestoreFromTrashModal(false);
                    setExpectedReturnDate("");
                    setReturnTrackingNumber("");
                  }}
                >
                  Отменить
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleRestoreFromTrash}
                  isLoading={updateOrder.isPending}
                  disabled={!expectedReturnDate}
                >
                  Подтвердить
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
