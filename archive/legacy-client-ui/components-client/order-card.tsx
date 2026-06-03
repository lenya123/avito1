"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import { getOrderStatusLabel, getOrderStatusColor, type OrderStatus } from "@/hooks/use-orders";
import { STATUS_HEX_COLORS } from "@/lib/constants/status-colors";

export type OrderData = {
  id: string;
  order_number: number;
  status: OrderStatus;
  size: string;
  client_price: number;
  sale_price: number | null;
  client_profit: number | null;
  delivery_service: string;
  delivery_deadline: string;
  created_at: string;
  // Дополнительные даты для "умной" второй даты
  shipped_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  expected_return_date?: string | null;
  return_completed_at?: string | null;
  trash_at?: string | null;
  updated_at?: string | null;
  product: {
    id: string;
    name: string;
    brand: string | null;
    photo_urls: string[] | null;
  };
};

export interface OrderCardProps {
  order: OrderData;
  onClick?: (orderId: string) => void;
  className?: string;
}

// Статусы с мигающим индикатором
const BLINKING_STATUSES: OrderStatus[] = [
  "awaiting_shipment",
  "collecting",
  "in_transit",
  "return_in_transit",
  "return_arrived",
];

// Получаем "умную" дату в зависимости от статуса заказа
type SmartDateInfo = {
  date: Date | null;
  label: string;
  isOverdue?: boolean;
};

function getSmartDate(order: OrderData): SmartDateInfo {
  const status = order.status;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Статусы ожидания/доставки → дедлайн
  if (["awaiting_shipment", "collecting", "in_transit"].includes(status)) {
    const deadline = new Date(order.delivery_deadline);
    const deadlineDay = new Date(deadline);
    deadlineDay.setHours(0, 0, 0, 0);
    return {
      date: deadline,
      label: "до",
      isOverdue: deadlineDay < today,
    };
  }

  // Завершён → дата завершения
  if (status === "completed" && order.completed_at) {
    return { date: new Date(order.completed_at), label: "" };
  }

  // Возврат в пути → ожидаемая дата прибытия
  if (status === "return_in_transit" && order.expected_return_date) {
    const expected = new Date(order.expected_return_date);
    const expectedDay = new Date(expected);
    expectedDay.setHours(0, 0, 0, 0);
    return {
      date: expected,
      label: "прибытие",
      isOverdue: expectedDay < today,
    };
  }

  // Возврат прибыл → показываем дату обновления (когда статус изменился)
  if (status === "return_arrived") {
    return { date: new Date(order.updated_at || order.created_at), label: "прибыл" };
  }

  // Возврат завершён → дата завершения возврата
  if (status === "return_completed" && order.return_completed_at) {
    return { date: new Date(order.return_completed_at), label: "" };
  }

  // Отменён → дата отмены
  if (status === "cancelled" && order.cancelled_at) {
    return { date: new Date(order.cancelled_at), label: "" };
  }

  // Утиль → дата перехода в утиль
  if (status === "trash" && order.trash_at) {
    return { date: new Date(order.trash_at), label: "" };
  }

  // Аннулирован → дата trash (начало утиля)
  if (status === "disposed" && order.trash_at) {
    return { date: new Date(order.trash_at), label: "" };
  }

  // Проблема → дедлайн
  if (status === "problem") {
    return { date: new Date(order.delivery_deadline), label: "до" };
  }

  // Fallback → дедлайн
  return { date: new Date(order.delivery_deadline), label: "до" };
}

export function OrderCard({ order, onClick, className }: OrderCardProps) {
  const status = order.status as OrderStatus;
  const isBlinking = BLINKING_STATUSES.includes(status);
  const statusColorKey = getOrderStatusColor(status);
  const statusLabel = getOrderStatusLabel(status);
  const statusHexColor = STATUS_HEX_COLORS[statusColorKey] || "rgba(255, 255, 255, 0.5)";

  const photoUrl = order.product.photo_urls?.[0];
  const hasProfit =
    status === "completed" && order.sale_price !== null && order.client_profit !== null;
  const isProfitable = hasProfit && order.client_profit! > 0;

  // "Умная" вторая дата — зависит от статуса
  const smartDate = getSmartDate(order);
  const isCompleted = status === "completed";

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`Заказ №${order.id}`}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      onClick={() => onClick?.(order.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(order.id);
        }
      }}
      className={cn(
        "group relative flex rounded-2xl overflow-hidden cursor-pointer",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card",
        "hover:border-glass-active",
        "active:scale-[0.98]",
        "transition-all duration-150",
        // Фон в зависимости от статуса - glass style
        isCompleted
          ? "bg-gradient-to-b from-[rgba(48,209,88,0.12)] to-[rgba(48,209,88,0.06)] hover:from-[rgba(48,209,88,0.16)] hover:to-[rgba(48,209,88,0.08)]"
          : "bg-gradient-to-b from-white/[0.08] to-white/[0.04] hover:from-white/[0.10] hover:to-white/[0.06]",
        className
      )}
    >
      {/* Декоративный блик */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="flex gap-3 p-3 w-full items-center">
        {/* Фото товара - квадратное */}
        <div
          className={cn(
            "relative w-[56px] h-[56px] rounded-xl overflow-hidden flex-shrink-0",
            "bg-gradient-to-br from-white/[0.1] to-white/[0.05]",
            "border border-glass-subtle",
            "shadow-glass-sm"
          )}
        >
          {photoUrl ? (
            <Image src={photoUrl} alt={order.product.name} fill className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Информация о заказе */}
        <div className="flex-1 min-w-0">
          {/* Первая строка: заголовок */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white truncate">
              #{order.order_number} · {order.product.name}
            </h3>
            <svg
              className="w-4 h-4 text-white/20 group-hover:text-white/40 flex-shrink-0 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>

          {/* Вторая строка: даты + бренд (sm+) + размер + статус (sm+) */}
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            {/* Дата заказа → умная дата */}
            <span className="text-white/40">
              {new Date(order.created_at).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "short",
              })}
            </span>
            <span className="text-white/20">→</span>
            {smartDate.label && <span className="text-white/20">{smartDate.label}</span>}
            <span className={smartDate.isOverdue ? "text-accent-red" : "text-white/40"}>
              {smartDate.date?.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) ??
                "—"}
            </span>
            <span className="text-white/20">·</span>
            {/* Бренд — только десктоп (дублируется в названии товара) */}
            {order.product.brand && (
              <>
                <span className="hidden sm:inline text-white/40">{order.product.brand}</span>
                <span className="hidden sm:inline text-white/20">·</span>
              </>
            )}
            <span className="text-white/40">{order.size}</span>
            {/* Статус — только десктоп (на мобильном переносится в строку цены) */}
            <span className="hidden sm:inline text-white/20">·</span>
            <span
              className={cn(
                "hidden sm:inline-block w-1.5 h-1.5 rounded-full flex-shrink-0",
                isBlinking && "animate-pulse"
              )}
              style={{
                background: statusHexColor,
                boxShadow: `0 0 4px 0 ${statusHexColor}`,
              }}
            />
            <span className="hidden sm:inline font-medium" style={{ color: statusHexColor }}>
              {statusLabel}
            </span>
          </div>

          {/* Третья строка: цена + прибыль | статус-бейдж (mobile) */}
          <div className="flex items-center justify-between gap-2 mt-1">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold text-white">
                {formatPrice(order.client_price)}
              </span>
              {hasProfit && (
                <span
                  className={cn(
                    "text-sm font-semibold",
                    isProfitable ? "text-accent-green" : "text-accent-red"
                  )}
                >
                  {isProfitable ? "+" : ""}
                  {formatPrice(order.client_profit!)}
                </span>
              )}
            </div>
            {/* Статус-бейдж — только мобильная */}
            <div className="flex sm:hidden items-center gap-1 flex-shrink-0">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                  isBlinking && "animate-pulse"
                )}
                style={{
                  background: statusHexColor,
                  boxShadow: `0 0 4px 0 ${statusHexColor}`,
                }}
              />
              <span className="text-xs font-medium" style={{ color: statusHexColor }}>
                {statusLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Skeleton для загрузки
export function OrderCardSkeleton() {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex gap-3 p-3 items-center">
        <div className="w-[56px] h-[56px] rounded-xl bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="h-4 w-3/4 bg-white/10 rounded" />
          <div className="h-3 w-full bg-white/10 rounded" />
          <div className="h-5 w-1/3 bg-white/10 rounded" />
        </div>
      </div>
    </div>
  );
}
