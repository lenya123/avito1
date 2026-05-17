"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  type OrderListItem,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  DELIVERY_SERVICE_LABELS,
} from "@/hooks/use-owner-orders";

interface OrderCardProps {
  order: OrderListItem;
  index: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

export function OrderCard({ order, index, selected, onSelect }: OrderCardProps) {
  const profit = order.clientPrice - order.purchasePrice;
  const isUrgent =
    order.deliveryDeadline && new Date(order.deliveryDeadline) < new Date(Date.now() + 86400000);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      transition={{ delay: index * 0.05 }}
      className={`relative overflow-hidden p-4 rounded-2xl backdrop-blur-xl shadow-card border transition-colors ${
        selected
          ? "bg-gradient-to-b from-white/[0.12] to-white/[0.08] border-white/30"
          : "bg-gradient-to-b from-white/[0.08] to-white/[0.04] border-glass hover:border-glass-active"
      } ${isUrgent ? "ring-1 ring-red-500/30" : ""}`}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="flex items-start gap-4">
        {/* Чекбокс */}
        {onSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(order.id)}
            className="mt-1 w-4 h-4 rounded border-white/20 bg-white/[0.06] text-white focus-visible:ring-accent-blue"
          />
        )}

        {/* Фото товара */}
        <div className="w-16 h-16 rounded-lg bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass overflow-hidden flex-shrink-0">
          {order.product?.photo ? (
            <img
              src={order.product.photo}
              alt={order.product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/40">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

        {/* Основная информация */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/owner/orders/${order.id}`}
                  className="font-medium text-white hover:text-white/80 transition-colors"
                >
                  #{order.orderNumber}
                </Link>
                <span
                  className={`px-2 py-0.5 text-xs rounded-md border ${
                    ORDER_STATUS_COLORS[order.status] || "bg-white/[0.06] text-white/60"
                  }`}
                >
                  {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ||
                    order.status}
                </span>
                {isUrgent && (
                  <span className="px-2 py-0.5 text-xs rounded-md bg-red-500/10 text-accent-red border border-red-500/20">
                    Срочно
                  </span>
                )}
              </div>
              <p className="text-sm text-white/60 mt-1 truncate">
                {order.product?.name || "Товар удалён"} • {order.size}
              </p>
            </div>

            {/* Цена */}
            <div className="text-right">
              <p className="font-medium text-white">{order.clientPrice.toLocaleString()} ₽</p>
              <p className={`text-sm ${profit >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                {profit >= 0 ? "+" : ""}
                {profit.toLocaleString()} ₽
              </p>
            </div>
          </div>

          {/* Дополнительная информация */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-white/60">
            {/* Клиент */}
            {order.client && (
              <Link
                href={`/owner/clients/${order.client.id}`}
                className="hover:text-white transition-colors"
              >
                @{order.client.username || order.client.name || "—"}
              </Link>
            )}

            {/* Служба доставки */}
            {order.deliveryService && (
              <span>{DELIVERY_SERVICE_LABELS[order.deliveryService] || order.deliveryService}</span>
            )}

            {/* Трек */}
            {order.trackingNumber && <span className="font-mono">{order.trackingNumber}</span>}

            {/* Дедлайн */}
            {order.deliveryDeadline && (
              <span className={isUrgent ? "text-accent-red" : ""}>
                До {new Date(order.deliveryDeadline).toLocaleDateString("ru-RU")}
              </span>
            )}

            {/* Дата создания */}
            <span className="ml-auto text-white/40">
              {new Date(order.createdAt).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="p-4 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-lg bg-white/[0.08]" />
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-5 w-16 bg-white/[0.08] rounded" />
                <div className="h-5 w-24 bg-white/[0.08] rounded" />
              </div>
              <div className="h-4 w-48 bg-white/[0.08] rounded" />
            </div>
            <div className="space-y-1">
              <div className="h-5 w-20 bg-white/[0.08] rounded" />
              <div className="h-4 w-16 bg-white/[0.08] rounded" />
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <div className="h-3 w-24 bg-white/[0.08] rounded" />
            <div className="h-3 w-16 bg-white/[0.08] rounded" />
            <div className="h-3 w-20 bg-white/[0.08] rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
