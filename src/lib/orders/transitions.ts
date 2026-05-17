import type { OrderStatus } from "@/types/database";

/**
 * Все статусы заказов. Используется для Zod-валидации.
 */
export const ALL_STATUSES: OrderStatus[] = [
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

/**
 * Допустимые переходы статусов заказа.
 * Ключ — текущий статус, значение — список разрешённых следующих статусов.
 *
 * Примечание: in_transit НЕ может перейти в cancelled напрямую —
 * посылка уже в пути, отмена невозможна.
 */
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  awaiting_shipment: ["collecting", "in_transit", "cancelled", "problem"],
  collecting: ["in_transit", "cancelled", "problem"],
  in_transit: ["completed", "return_in_transit", "problem"],
  completed: ["return_in_transit"],
  return_in_transit: ["return_arrived", "problem"],
  return_arrived: ["return_completed", "trash", "problem"],
  return_completed: [],
  cancelled: [],
  problem: ["awaiting_shipment", "cancelled"],
  trash: ["disposed", "return_completed", "return_in_transit"],
  disposed: [],
};

/**
 * Проверить допустим ли переход из текущего статуса в новый.
 * Возвращает false если статусы одинаковые (noop) или переход не разрешён.
 */
export function isValidTransition(currentStatus: OrderStatus, newStatus: OrderStatus): boolean {
  if (currentStatus === newStatus) return false;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(newStatus) : false;
}

/**
 * Проверить допустимость перехода. Бросает ошибку если невалидно.
 * Используется в API routes для строгой валидации.
 */
export function validateTransition(currentStatus: OrderStatus, newStatus: OrderStatus): void {
  if (currentStatus === newStatus) {
    throw new Error(`Заказ уже в статусе ${currentStatus}`);
  }
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new Error(`Невалидный переход: ${currentStatus} → ${newStatus}`);
  }
}
