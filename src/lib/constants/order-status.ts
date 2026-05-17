import type { OrderStatus, DeliveryService } from "@/types/database";

/**
 * Каноничные названия статусов заказов.
 * Единственный источник правды — импортировать отсюда, не дублировать.
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_shipment: "Ожидает отправки",
  collecting: "Собирается",
  in_transit: "В пути",
  completed: "Доставлен",
  return_in_transit: "Возврат в пути",
  return_arrived: "Возврат прибыл",
  return_completed: "Возврат завершён",
  cancelled: "Отменён",
  problem: "Проблема",
  trash: "Корзина",
  disposed: "Утилизирован",
};

/**
 * Цветовые ключи для статусов (CSS переменные / Tailwind).
 */
export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  awaiting_shipment: "accent-green",
  collecting: "accent-green",
  in_transit: "accent-green",
  completed: "accent-green",
  return_in_transit: "accent-orange",
  return_arrived: "accent-orange",
  return_completed: "accent-orange",
  cancelled: "accent-red",
  problem: "accent-red",
  trash: "accent-red",
  disposed: "white/30",
};

/**
 * Варианты Badge для статусов (owner dashboard).
 */
export const ORDER_STATUS_BADGE_VARIANTS: Record<
  OrderStatus,
  "default" | "success" | "warning" | "error" | "info" | "purple"
> = {
  awaiting_shipment: "info",
  collecting: "info",
  in_transit: "purple",
  completed: "success",
  return_in_transit: "warning",
  return_arrived: "warning",
  return_completed: "default",
  cancelled: "error",
  problem: "error",
  trash: "error",
  disposed: "default",
};

/**
 * HEX-цвета для индикаторов статусов.
 */
export const STATUS_HEX_COLORS: Record<string, string> = {
  "accent-orange": "#FF9F0A",
  "accent-blue": "#0A84FF",
  "accent-green": "#30D158",
  "accent-red": "#FF453A",
  "white/50": "rgba(255, 255, 255, 0.5)",
  "white/30": "rgba(255, 255, 255, 0.3)",
};

/**
 * Статусы с мигающим индикатором (заказ в активном движении).
 */
export const BLINKING_STATUSES: OrderStatus[] = [
  "awaiting_shipment",
  "collecting",
  "in_transit",
  "return_in_transit",
  "return_arrived",
];

/**
 * Названия служб доставки.
 */
export const DELIVERY_SERVICE_LABELS: Record<DeliveryService | string, string> = {
  avito: "Авито Доставка",
  yandex: "Яндекс Доставка",
  cdek: "СДЭК",
  pochta: "Почта России",
  "5post": "5Post",
};

/**
 * Эмодзи для статусов (Telegram).
 */
export const ORDER_STATUS_EMOJI: Record<OrderStatus, string> = {
  awaiting_shipment: "\u{1F4E6}",
  collecting: "\u{1F527}",
  in_transit: "\u{1F69A}",
  completed: "\u2705",
  return_in_transit: "\u21A9\uFE0F",
  return_arrived: "\u{1F4E5}",
  return_completed: "\u2714\uFE0F",
  cancelled: "\u274C",
  problem: "\u26A0\uFE0F",
  trash: "\u{1F5D1}\uFE0F",
  disposed: "\u{1F6AE}",
};

/**
 * Хелпер: получить label для статуса.
 */
export function getOrderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] || status;
}

/**
 * Хелпер: получить цветовой ключ для статуса.
 */
export function getOrderStatusColor(status: OrderStatus): string {
  return ORDER_STATUS_COLORS[status] || "white/50";
}

/**
 * Хелпер: форматировать статус с эмодзи (для Telegram).
 */
export function formatOrderStatus(status: string): string {
  const emoji = ORDER_STATUS_EMOJI[status as OrderStatus] || "\u{1F4CB}";
  const label = ORDER_STATUS_LABELS[status as OrderStatus] || status;
  return `${emoji} ${label}`;
}
