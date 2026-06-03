import type { OrderStatus, DeliveryService } from "@/types/database";

/**
 * Каноничные названия статусов заказов (BUSINESS_LOGIC §4.2).
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  paid: "Оплачен",
  collecting: "В сборке",
  sent: "Отправлен",
  return: "Возврат",
  return_done: "Возврат принят",
  cancelled: "Отменён",
  problem: "Нет на складе",
  trash: "Утиль",
  // Авито-only (§15):
  awaiting_size: "Ждёт размера",
  delivered: "Доставлен",
  return_in_transit: "Возврат в пути",
};

/**
 * Цветовые ключи для статусов (CSS переменные / Tailwind).
 */
export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  paid: "accent-blue",
  collecting: "accent-green",
  sent: "accent-green",
  return: "accent-orange",
  return_done: "accent-green",
  cancelled: "accent-red",
  problem: "accent-red",
  trash: "white/30",
  awaiting_size: "accent-blue",
  delivered: "accent-green",
  return_in_transit: "accent-orange",
};

/**
 * Варианты Badge для статусов (owner dashboard).
 */
export const ORDER_STATUS_BADGE_VARIANTS: Record<
  OrderStatus,
  "default" | "success" | "warning" | "error" | "info" | "purple"
> = {
  paid: "info",
  collecting: "info",
  sent: "success",
  return: "warning",
  return_done: "success",
  cancelled: "error",
  problem: "error",
  trash: "default",
  awaiting_size: "info",
  delivered: "success",
  return_in_transit: "warning",
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
export const BLINKING_STATUSES: OrderStatus[] = ["paid", "collecting", "return"];

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
  paid: "\u{1F4B3}",
  collecting: "\u{1F527}",
  sent: "\u{1F69A}",
  return: "↩️",
  return_done: "✔️",
  cancelled: "❌",
  problem: "⚠️",
  trash: "\u{1F5D1}️",
  awaiting_size: "\u{1F4CF}",
  delivered: "\u{1F4E6}",
  return_in_transit: "\u{1F501}",
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
