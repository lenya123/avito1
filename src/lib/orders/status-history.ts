import type { Json } from "@/types/database";

/**
 * Запись в status_history. Совместима со столбцом orders.status_history (JSONB).
 * Дополнительные метаданные перехода (например, `is_auto_revert: true`) кладутся
 * как обычные ключи рядом со status/timestamp — БД хранит их как JSON.
 */
export type StatusHistoryEntry = {
  status: string;
  timestamp: string;
} & { [key: string]: Json | undefined };

/**
 * Добавить запись в status_history заказа. Возвращает новый массив.
 * Принимает Json | null (тип из БД) или StatusHistoryEntry[] | null.
 *
 * @param extras произвольные метаданные перехода (например, `{ is_auto_revert: true, from: 'collecting' }`).
 */
export function appendStatusHistory(
  currentHistory: StatusHistoryEntry[] | Json | null,
  newStatus: string,
  extras?: Record<string, Json | undefined>
): StatusHistoryEntry[] {
  const history = Array.isArray(currentHistory) ? (currentHistory as StatusHistoryEntry[]) : [];
  const entry: StatusHistoryEntry = {
    status: newStatus,
    timestamp: new Date().toISOString(),
    ...(extras ?? {}),
  };
  return [...history, entry];
}
