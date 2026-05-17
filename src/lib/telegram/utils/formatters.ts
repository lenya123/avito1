/**
 * Утилиты форматирования для Telegram сообщений
 */

/**
 * Форматирует цену в рублях
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat("ru-RU").format(price) + " ₽";
}

/**
 * Форматирует дату
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Форматирует дату и время
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Re-export from canonical source
export {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_EMOJI,
  DELIVERY_SERVICE_LABELS,
  formatOrderStatus,
} from "@/lib/constants/order-status";

import { DELIVERY_SERVICE_LABELS as _DSL } from "@/lib/constants/order-status";

/**
 * Форматирует службу доставки
 */
export function formatDeliveryService(service: string): string {
  return _DSL[service] || service;
}

/**
 * Тарифы подписки
 */
export const SUBSCRIPTION_LABELS: Record<string, string> = {
  none: "Нет подписки",
  basic: "Basic",
  premium: "Premium",
  top_floor_boss: "Top Floor Boss",
};

/**
 * Экранирует HTML-символы для Telegram
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Форматирует уровень пользователя
 */
const LEVEL_NAMES = ["Новичок", "Продавец", "Профи", "Эксперт"];

export function formatLevel(level: number): string {
  const name = LEVEL_NAMES[level] ?? `Уровень ${level}`;
  return `Уровень: ${name}`;
}

/**
 * Форматирует скидку уровня
 */
export function getLevelDiscount(level: number): number {
  const discounts: Record<number, number> = {
    0: 0,
    1: 3,
    2: 6,
    3: 10,
  };
  return discounts[level] ?? 10;
}
