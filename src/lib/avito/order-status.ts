/**
 * Классификатор статусов заказов Avito Доставки для KPI-окна «статистика по заказам».
 *
 * Avito не отдаёт строгий enum статусов — приходят status/status_label строками
 * (рус/англ, меняются). Поэтому классификация эвристическая по ключевым словам.
 * Категории по ТЗ: активные / успешные / активные возвраты / завершённые возвраты.
 *
 * // STUB: owner-panel — при интеграции уточнить точный маппинг статусов Avito
 * (есть закрытый перечень в внутренней панели).
 */
export type AvitoOrderCategory =
  | "active"
  | "successful"
  | "return_active"
  | "return_completed"
  | "cancelled";

const has = (s: string, ...needles: string[]) =>
  needles.some((n) => s.includes(n));

export function classifyAvitoOrder(
  status?: string | null,
  statusLabel?: string | null
): AvitoOrderCategory {
  const s = `${status ?? ""} ${statusLabel ?? ""}`.toLowerCase().trim();

  // Возвраты
  const isReturn = has(s, "return", "возврат", "refund");
  if (isReturn) {
    if (
      has(
        s,
        "completed",
        "done",
        "finished",
        "closed",
        "received",
        "заверш",
        "получ",
        "закрыт"
      )
    ) {
      return "return_completed";
    }
    return "return_active";
  }

  // Отмена / провал
  if (has(s, "cancel", "отмен", "failed", "expired", "истёк", "истек", "annul")) {
    return "cancelled";
  }

  // Успешно завершённые
  if (
    has(
      s,
      "completed",
      "delivered",
      "received",
      "success",
      "done",
      "closed",
      "выполнен",
      "доставлен",
      "получен",
      "заверш"
    )
  ) {
    return "successful";
  }

  // Всё остальное — в работе (ожидает отправки/в пути/новый и т.п.)
  return "active";
}

export interface AvitoOrdersStats {
  totalMonth: number;
  active: number;
  successful: number;
  returnsActive: number;
  returnsCompleted: number;
}

export function emptyOrdersStats(): AvitoOrdersStats {
  return {
    totalMonth: 0,
    active: 0,
    successful: 0,
    returnsActive: 0,
    returnsCompleted: 0,
  };
}
