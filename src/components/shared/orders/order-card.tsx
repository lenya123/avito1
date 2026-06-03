"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import {
  type OrderListItem,
  ORDER_STATUS_LABELS,
  DELIVERY_SERVICE_LABELS,
} from "@/hooks/use-owner-orders";
import { getOrderStatusColor } from "@/lib/constants/order-status";
import type { OrderStatus } from "@/types/database";
import { STATUS_HEX_COLORS } from "@/lib/constants/status-colors";

interface OrderCardProps {
  order: OrderListItem;
  index: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
  /** Base URL for links, e.g. "/owner" or "/seller". Defaults to "/owner". */
  baseUrl?: string;
  /** Show seller profit (client_price - purchase_price). Owner only. Default true. */
  showProfit?: boolean;
}

// Канон §4.2: paid → collecting → sent + return → return_done.
// «Активные» — заказ ещё в работе (визуально мигает).
// «Терминальные» — финал, не мигает.
const BLINKING_STATUSES: string[] = ["paid", "collecting", "return"];

const TERMINAL_STATUSES: string[] = ["sent", "return_done", "cancelled", "trash"];

export function OrderCard({
  order,
  index,
  selected,
  onSelect,
  baseUrl = "/owner",
  showProfit = true,
}: OrderCardProps) {
  // Прибыль — канон §9.4 (считает сервер: свой = client−purchase−ставка
  // отправщика; партнёрский = комиссия). Раньше тут был сырой
  // client−purchase — занижал/искажал.
  const profit = order.profit;
  const status = order.status as OrderStatus;
  const isBlinking = BLINKING_STATUSES.includes(status);
  const statusColorKey = getOrderStatusColor(status);
  const statusHexColor = STATUS_HEX_COLORS[statusColorKey] || "rgba(255, 255, 255, 0.5)";
  const statusLabel = ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS] || status;
  // BUSINESS_LOGIC §4.2: «отправлен» — финальный успешный.
  const isCompleted = status === "sent";

  // Срочность: дедлайн < 24ч, но только для активных статусов
  const isUrgent =
    !TERMINAL_STATUSES.includes(status) &&
    !!order.sendBy &&
    new Date(order.sendBy) < new Date(Date.now() + 86400000);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        "group relative flex rounded-2xl overflow-hidden",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card",
        "hover:border-glass-active",
        "transition-all duration-150",
        selected
          ? "bg-gradient-to-b from-white/[0.12] to-white/[0.08] border-white/30"
          : isCompleted
            ? "bg-gradient-to-b from-[rgba(48,209,88,0.12)] to-[rgba(48,209,88,0.06)]"
            : "bg-gradient-to-b from-white/[0.08] to-white/[0.04] hover:from-white/[0.10] hover:to-white/[0.06]"
      )}
    >
      {/* Decorative highlight */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="flex gap-3 p-3 w-full items-center">
        {/* Checkbox */}
        {onSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(order.id);
            }}
            className="w-4 h-4 rounded border-white/20 bg-white/[0.06] text-accent-blue focus-visible:ring-accent-blue flex-shrink-0"
          />
        )}

        {/* Product photo */}
        <div
          className={cn(
            "relative w-[56px] h-[56px] rounded-xl overflow-hidden flex-shrink-0",
            "bg-gradient-to-br from-white/[0.1] to-white/[0.05]",
            "border border-glass-subtle",
            "shadow-glass-sm"
          )}
        >
          {order.product?.photo ? (
            <Image
              src={order.product.photo}
              alt={order.product.name}
              fill
              className="object-cover"
            />
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

        {/* Order info */}
        <div className="flex-1 min-w-0">
          {/* Row 1: title + chevron */}
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`${baseUrl}/orders/${order.id}`}
              className="text-sm font-semibold text-white truncate hover:text-white/80 transition-colors"
            >
              #{order.orderNumber} · {order.product?.name || "Товар удалён"}
            </Link>
            <svg
              className="w-4 h-4 text-white/20 group-hover:text-white/40 flex-shrink-0 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>

          {/* Row 2: meta — date, deadline, size, client, status */}
          <div className="flex items-center gap-1.5 mt-1 text-xs flex-wrap">
            {/* Created date */}
            <span className="text-white/40">
              {new Date(order.createdAt).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "short",
              })}
            </span>

            {/* Deadline (with urgency color) */}
            {order.sendBy && (
              <>
                <span className="text-white/20">→</span>
                <span className="text-white/20">до</span>
                <span className={isUrgent ? "text-accent-red" : "text-white/40"}>
                  {new Date(order.sendBy).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </>
            )}

            <span className="text-white/20">·</span>
            <span className="text-white/40">{order.size}</span>

            {/* Client */}
            {order.client && (
              <>
                <span className="text-white/20">·</span>
                <Link
                  href={`${baseUrl}/clients/${order.client.id}`}
                  className="text-white/40 hover:text-white transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  @{order.client.username || order.client.name || "—"}
                </Link>
              </>
            )}

            {/* Status dot + label — desktop */}
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

          {/* Row 3: price + profit | delivery | status (mobile) */}
          <div className="flex items-center justify-between gap-2 mt-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-white">
                {formatPrice(order.clientPrice)}
              </span>
              {isCompleted && showProfit && (
                <span
                  className={cn(
                    "text-sm font-semibold",
                    profit >= 0 ? "text-accent-green" : "text-accent-red"
                  )}
                >
                  {profit >= 0 ? "+" : ""}
                  {formatPrice(profit)}
                </span>
              )}

              {/* Delivery service — desktop */}
              {order.deliveryService && (
                <span className="hidden sm:inline text-xs text-white/30">
                  {DELIVERY_SERVICE_LABELS[order.deliveryService] || order.deliveryService}
                </span>
              )}

              {/* Tracking — desktop */}
              {order.trackingNumber && (
                <span className="hidden md:inline text-xs text-white/30 font-mono">
                  {order.trackingNumber}
                </span>
              )}
            </div>

            {/* Status badge — mobile only */}
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
