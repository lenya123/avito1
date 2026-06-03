import type { OrderStatus } from "@/types/database";

export type TransitionRole = "owner" | "shipper";

/**
 * Все статусы заказов (BUSINESS_LOGIC §4.2). Используется для Zod-валидации.
 */
export const ALL_STATUSES: OrderStatus[] = [
  "paid",
  "collecting",
  "sent",
  "return",
  "return_done",
  "trash",
  "cancelled",
  "problem",
  // Авито-only (§15):
  "awaiting_size",
  "delivered",
  "return_in_transit",
];

/**
 * Допустимые переходы статусов заказа (BUSINESS_LOGIC §4.4).
 * Ключ — текущий статус, значение — список разрешённых следующих статусов.
 *
 * Печать стикера — внутрянка отправщика, не отдельный статус. Факт печати
 * фиксируется флагом orders.barcode_printed/_at, статус остаётся collecting.
 */
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  paid: ["collecting", "cancelled", "problem"],
  collecting: ["sent", "paid", "cancelled", "problem"],
  sent: ["return", "delivered", "return_in_transit"],
  return: ["return_done", "sent", "trash"],
  return_done: [],
  trash: ["return"],
  cancelled: [],
  problem: ["collecting", "cancelled"],
  // Авито-only (§15.4):
  awaiting_size: ["paid", "cancelled"],
  delivered: ["return_in_transit", "return"],
  return_in_transit: ["return", "return_done"],
};

/**
 * Проверить допустим ли переход из текущего статуса в новый.
 */
export function isValidTransition(currentStatus: OrderStatus, newStatus: OrderStatus): boolean {
  if (currentStatus === newStatus) return false;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(newStatus) : false;
}

/**
 * Проверить допустимость перехода. Бросает ошибку если невалидно.
 */
export function validateTransition(currentStatus: OrderStatus, newStatus: OrderStatus): void {
  if (currentStatus === newStatus) {
    throw new Error(`Заказ уже в статусе ${currentStatus}`);
  }
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new Error(`Невалидный переход: ${currentStatus} → ${newStatus}`);
  }
}

/**
 * Что разрешено отправщику (BUSINESS_LOGIC §4.4 «Беру в работу» / «Напечатал стикер» / «Сдал в ПВЗ»).
 */
const SHIPPER_ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ["collecting"],
  collecting: ["sent", "problem"],
  return: ["return_done"],
};

export function getAllowedTransitions(
  currentStatus: OrderStatus,
  role: TransitionRole
): OrderStatus[] {
  const global = VALID_TRANSITIONS[currentStatus] ?? [];
  if (role === "owner") return global;
  const whitelist = SHIPPER_ALLOWED_TRANSITIONS[currentStatus];
  if (!whitelist) return [];
  return global.filter((status) => whitelist.includes(status));
}

export function isValidTransitionForRole(
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
  role: TransitionRole
): boolean {
  if (currentStatus === newStatus) return false;
  return getAllowedTransitions(currentStatus, role).includes(newStatus);
}

export function validateTransitionForRole(
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
  role: TransitionRole
): void {
  if (currentStatus === newStatus) {
    throw new Error(`Заказ уже в статусе ${currentStatus}`);
  }
  if (!isValidTransitionForRole(currentStatus, newStatus, role)) {
    throw new Error(`Роли ${role} не разрешён переход ${currentStatus} → ${newStatus}`);
  }
}
