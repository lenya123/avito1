import type { OrderStatus } from "@/types/database";

/**
 * Маппинг action-текстов Track.global → наши OrderStatus
 *
 * Track.global возвращает текстовые описания событий на английском.
 * Маппим по ключевым словам в action, т.к. точные значения
 * зависят от конкретной службы доставки.
 */

/** Паттерны для определения статуса по action тексту */
const ACTION_PATTERNS: Array<{ pattern: RegExp; status: OrderStatus }> = [
  // Доставлено
  { pattern: /\bdeliver(ed|y\s+complete)/i, status: "completed" },
  { pattern: /\bpicked\s*up\s+by\s+(recipient|customer)/i, status: "completed" },
  { pattern: /\breceived\s+by/i, status: "completed" },

  // Возврат
  { pattern: /\breturn(ed)?\s+(to\s+sender|in\s+progress|shipment)/i, status: "return_in_transit" },
  { pattern: /\bsend(ing)?\s+back/i, status: "return_in_transit" },
  { pattern: /\breturn(ed)?\s+(deliver|arriv|complet)/i, status: "return_arrived" },

  // Проблемы
  { pattern: /\b(exception|problem|damage|lost|missing)\b/i, status: "problem" },
  { pattern: /\bfailed\s+(delivery|attempt)/i, status: "in_transit" },
  { pattern: /\bundeliverable\b/i, status: "problem" },

  // Ожидает в ПВЗ (считаем как in_transit — ещё не получено)
  {
    pattern: /\b(ready\s+for\s+pick\s*up|awaiting\s+(collection|pick\s*up))/i,
    status: "in_transit",
  },
  { pattern: /\barrived\s+at\s+(pick\s*up|collection)\s*point/i, status: "in_transit" },

  // В пути (общие)
  {
    pattern: /\b(in\s+transit|departure|departed|dispatch|shipped|out\s+for\s+delivery)/i,
    status: "in_transit",
  },
  { pattern: /\b(arrived|arrival|customs|sorting|processing|transit)/i, status: "in_transit" },
  { pattern: /\b(flight|landed|warehouse|hub|facility|center|centre)/i, status: "in_transit" },
  { pattern: /\bdelivery\s+in\s+progress/i, status: "in_transit" },

  // Принято / начало
  { pattern: /\b(accepted|collected|picked\s*up\s+from\s+sender)/i, status: "collecting" },
  {
    pattern: /\b(info\s+received|order\s+created|registered|label\s+created)/i,
    status: "awaiting_shipment",
  },
  { pattern: /\bpending\b/i, status: "awaiting_shipment" },

  // Истёк срок хранения
  { pattern: /\b(expired|unclaimed)\b/i, status: "trash" },
];

/**
 * Определить OrderStatus по action тексту из Track.global
 */
export function mapTrackGlobalAction(action: string): OrderStatus {
  if (!action) return "in_transit";

  for (const { pattern, status } of ACTION_PATTERNS) {
    if (pattern.test(action)) {
      return status;
    }
  }

  // Fallback — если не распознали, считаем что в пути
  return "in_transit";
}

/**
 * Получить человекочитаемое описание статуса
 */
export function getStatusDescription(status: OrderStatus): string {
  const descriptions: Record<OrderStatus, string> = {
    awaiting_shipment: "Ждёт отправки",
    collecting: "Собирается",
    in_transit: "В пути",
    completed: "Доставлен",
    return_in_transit: "Возврат в пути",
    return_arrived: "Возврат прибыл",
    return_completed: "Возврат завершён",
    cancelled: "Отменён",
    problem: "Проблема",
    trash: "Утиль",
    disposed: "Аннулирован",
  };
  return descriptions[status] || status;
}
