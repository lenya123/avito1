"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
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

import type { OrderStatus } from "@/types/database";

const ALL_STATUSES = [
  "awaiting_shipment",
  "collecting",
  "in_transit",
  "completed",
  "return_in_transit",
  "return_arrived",
  "return_completed",
  "cancelled",
  "problem",
  "trash",
  "disposed",
];

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

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const { data, isLoading, error, refetch } = useOwnerOrder(orderId);
  const updateOrder = useUpdateOwnerOrder();

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showShipperModal, setShowShipperModal] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);

  const [selectedStatus, setSelectedStatus] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [selectedShipper, setSelectedShipper] = useState("");
  const [trackingInput, setTrackingInput] = useState("");
  const [returnTrackingInput, setReturnTrackingInput] = useState("");
  const [commentInput, setCommentInput] = useState("");

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

  const { order, product, client, shipper, availableShippers, history } = data;
  const profit = order.clientPrice - order.purchasePrice;
  const isUrgent =
    order.deliveryDeadline &&
    new Date(order.deliveryDeadline).getTime() - Date.now() < 24 * 60 * 60 * 1000 &&
    ["awaiting_shipment", "collecting"].includes(order.status);

  const handleChangeStatus = async () => {
    if (!selectedStatus) return;
    try {
      await updateOrder.mutateAsync({
        orderId,
        action: "change_status",
        status: selectedStatus,
        cancelReason: selectedStatus === "cancelled" ? cancelReason : undefined,
      });
      setShowStatusModal(false);
      setSelectedStatus("");
      setCancelReason("");
    } catch {
      // Error shown via mutation state
    }
  };

  const handleAssignShipper = async () => {
    if (!selectedShipper) return;
    try {
      await updateOrder.mutateAsync({
        orderId,
        action: "assign_shipper",
        shipperId: selectedShipper,
      });
      setShowShipperModal(false);
      setSelectedShipper("");
    } catch {
      // Error shown via mutation state
    }
  };

  const handleUpdateTracking = async () => {
    try {
      await updateOrder.mutateAsync({
        orderId,
        action: "update_tracking",
        trackingNumber: trackingInput || undefined,
        returnTrackingNumber: returnTrackingInput || undefined,
      });
      setShowTrackingModal(false);
      setTrackingInput("");
      setReturnTrackingInput("");
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
        <Link
          href="/owner/orders"
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
          Назад к заказам
        </Link>
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
                {order.source}
              </span>
            )}
          </div>
          <p className="text-white/60">
            {DELIVERY_SERVICE_LABELS[order.deliveryService] || order.deliveryService}
            {order.trackingNumber && ` • ${order.trackingNumber}`}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => {
              setSelectedStatus(order.status);
              setShowStatusModal(true);
            }}
          >
            Изменить статус
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSelectedShipper(shipper?.id || "");
              setShowShipperModal(true);
            }}
          >
            {shipper ? "Сменить отправщика" : "Назначить отправщика"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTrackingInput(order.trackingNumber || "");
              setReturnTrackingInput(order.returnTrackingNumber || "");
              setShowTrackingModal(true);
            }}
          >
            Трек-номер
          </Button>
        </div>
      </motion.div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              <div>
                <p className="text-xs text-white/40 mb-1">Дедлайн доставки</p>
                <p className={isUrgent ? "text-accent-red font-medium" : "text-white"}>
                  {new Date(order.deliveryDeadline).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
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
              <div>
                <p className="text-xs text-white/40 mb-1">Оплата</p>
                <p className={order.isPaid ? "text-accent-green" : "text-accent-orange"}>
                  {order.isPaid ? "Оплачен" : "Не оплачен"}
                  {order.paymentMethod && ` • ${order.paymentMethod}`}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Создан</p>
                <p className="text-white">{new Date(order.createdAt).toLocaleString("ru-RU")}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Product card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Товар</h3>
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
                      {product.brand && <p className="text-xs text-white/60">{product.brand}</p>}
                    </div>
                  </Link>
                  {order.size && (
                    <div>
                      <p className="text-xs text-white/40 mb-1">Размер</p>
                      <p className="text-white">{order.size}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-white/40 mb-1">Дроп-цена</p>
                    <p className="text-white">{product.dropPrice.toLocaleString("ru-RU")} ₽</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Закупочная</p>
                    <p className="text-white/60">
                      {product.purchasePrice.toLocaleString("ru-RU")} ₽
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-white/60">Товар не найден</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Finance card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Финансы</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-white/40 mb-1">Цена клиента</p>
                <p className="text-xl font-bold text-white">
                  {order.clientPrice.toLocaleString("ru-RU")} ₽
                </p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Закупочная</p>
                <p className="text-white/60">{order.purchasePrice.toLocaleString("ru-RU")} ₽</p>
              </div>
              {order.salePrice !== null && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Цена продажи</p>
                  <p className="text-white">{order.salePrice.toLocaleString("ru-RU")} ₽</p>
                </div>
              )}
              <div className="pt-2 border-t border-glass">
                <p className="text-xs text-white/40 mb-1">Прибыль</p>
                <p
                  className={`text-xl font-bold ${profit >= 0 ? "text-accent-green" : "text-accent-red"}`}
                >
                  {profit.toLocaleString("ru-RU")} ₽
                </p>
              </div>
              {order.clientProfit !== null && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Прибыль клиента</p>
                  <p className="text-white">{order.clientProfit.toLocaleString("ru-RU")} ₽</p>
                </div>
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
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass text-white/60">
                      Уровень {client.level || 0}
                    </span>
                    {client.isVibePlus && (
                      <span className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-orange-500/20 to-orange-500/10 border border-orange-500/25 text-accent-orange">
                        +ВАЙБ
                      </span>
                    )}
                  </div>
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

        {/* Shipper card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="font-semibold text-white">Отправщик</h3>
              {!shipper && (
                <Button variant="ghost" size="sm" onClick={() => setShowShipperModal(true)}>
                  Назначить
                </Button>
              )}
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
                <p className="text-white/60">Отправщик не назначен</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Comments card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
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
            {order.cancelReason && (
              <div>
                <p className="text-xs text-white/40 mb-1">Причина отмены</p>
                <p className="text-accent-red text-sm">{order.cancelReason}</p>
              </div>
            )}
            {!order.clientComment && !order.systemComment && !order.cancelReason && (
              <p className="text-white/40 text-center py-2">Нет комментариев</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

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
                      <p className="text-xs text-white/60">{order.cancelReason}</p>
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

      {/* Status change modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="Изменить статус"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            {ALL_STATUSES.map((status) => (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`w-full p-3 rounded-xl text-left transition-all border ${
                  selectedStatus === status
                    ? "bg-accent-blue/20 border-accent-blue/50 text-white"
                    : status === order.status
                      ? "bg-white/[0.02] border-glass-subtle text-white/20"
                      : "bg-white/[0.04] border-glass hover:bg-white/[0.06] text-white"
                }`}
              >
                {ORDER_STATUS_LABELS[status as OrderStatus] || status}
                {status === order.status && (
                  <span className="text-xs text-white/20 ml-2">Текущий</span>
                )}
              </button>
            ))}
          </div>

          {selectedStatus === "cancelled" && (
            <Input
              label="Причина отмены"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Укажите причину..."
            />
          )}

          {updateOrder.isError && (
            <p className="text-sm text-accent-red">
              {updateOrder.error instanceof Error ? updateOrder.error.message : "Ошибка обновления"}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowStatusModal(false)} className="flex-1">
              Отмена
            </Button>
            <Button
              onClick={handleChangeStatus}
              isLoading={updateOrder.isPending}
              disabled={!selectedStatus || selectedStatus === order.status}
              className="flex-1"
            >
              Применить
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign shipper modal */}
      <Modal
        isOpen={showShipperModal}
        onClose={() => setShowShipperModal(false)}
        title="Назначить отправщика"
      >
        <div className="space-y-4">
          {availableShippers.length === 0 ? (
            <p className="text-white/60 text-center py-4">Нет доступных отправщиков</p>
          ) : (
            <div className="space-y-2">
              {availableShippers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedShipper(s.id)}
                  className={`w-full p-3 rounded-xl text-left transition-all border ${
                    selectedShipper === s.id
                      ? "bg-accent-blue/20 border-accent-blue/50 text-white"
                      : "bg-white/[0.04] border-glass hover:bg-white/[0.06] text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-b from-purple-500/30 to-purple-500/15 border border-purple-500/20 flex items-center justify-center">
                      <span className="text-accent-purple text-sm font-medium">
                        {s.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span>{s.name}</span>
                    {shipper?.id === s.id && <span className="text-xs text-white/20">Текущий</span>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {updateOrder.isError && (
            <p className="text-sm text-accent-red">
              {updateOrder.error instanceof Error ? updateOrder.error.message : "Ошибка обновления"}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowShipperModal(false)} className="flex-1">
              Отмена
            </Button>
            <Button
              onClick={handleAssignShipper}
              isLoading={updateOrder.isPending}
              disabled={!selectedShipper}
              className="flex-1"
            >
              Назначить
            </Button>
          </div>
        </div>
      </Modal>

      {/* Tracking modal */}
      <Modal
        isOpen={showTrackingModal}
        onClose={() => setShowTrackingModal(false)}
        title="Трек-номер"
      >
        <div className="space-y-4">
          <Input
            label="Трек-номер"
            value={trackingInput}
            onChange={(e) => setTrackingInput(e.target.value)}
            placeholder="Введите трек-номер"
          />
          <Input
            label="Трек возврата (опционально)"
            value={returnTrackingInput}
            onChange={(e) => setReturnTrackingInput(e.target.value)}
            placeholder="Трек-номер возврата"
          />

          {updateOrder.isError && (
            <p className="text-sm text-accent-red">
              {updateOrder.error instanceof Error ? updateOrder.error.message : "Ошибка обновления"}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowTrackingModal(false)} className="flex-1">
              Отмена
            </Button>
            <Button
              onClick={handleUpdateTracking}
              isLoading={updateOrder.isPending}
              className="flex-1"
            >
              Сохранить
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
