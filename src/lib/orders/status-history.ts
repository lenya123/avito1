import type { Json } from "@/types/database";

export type StatusHistoryEntry = {
  status: string;
  timestamp: string;
};

/**
 * Добавить запись в status_history заказа.
 * Возвращает новый массив (не мутирует оригинал).
 * Принимает Json | null (тип из БД) или StatusHistoryEntry[] | null.
 */
export function appendStatusHistory(
  currentHistory: StatusHistoryEntry[] | Json | null,
  newStatus: string
): StatusHistoryEntry[] {
  const history = Array.isArray(currentHistory) ? (currentHistory as StatusHistoryEntry[]) : [];
  return [...history, { status: newStatus, timestamp: new Date().toISOString() }];
}
