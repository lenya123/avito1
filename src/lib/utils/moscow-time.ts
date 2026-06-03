/**
 * Единые утилиты времени по Москве (Europe/Moscow).
 *
 * Все cron-задачи, дедлайны (`send_by`, `pickup_by`), расчёты «вчера/сегодня»
 * и UI-форматирование, привязанные к московскому дню, должны идти через эти
 * функции — а не хардкодить `+03:00` или дублировать `timeZone: "Europe/Moscow"`
 * в десятках мест. Один helper переживёт любые гипотетические изменения
 * TZ-правил России.
 */

export const MOSCOW_TZ = "Europe/Moscow";

/**
 * Сегодняшняя дата в Москве как `YYYY-MM-DD`.
 */
export function moscowToday(when: Date = new Date()): string {
  return when.toLocaleDateString("en-CA", { timeZone: MOSCOW_TZ });
}

/**
 * Текущее время в Москве как `HH:mm:ss` (24h) — для сравнения с cutoff'ами
 * вида `business_settings.send_by_today_cutoff`.
 */
export function moscowTimeNow(when: Date = new Date()): string {
  return when.toLocaleTimeString("en-GB", { timeZone: MOSCOW_TZ, hour12: false });
}

/**
 * Календарные компоненты момента в Москве.
 */
export function moscowParts(when: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map = Object.fromEntries(fmt.formatToParts(when).map((p) => [p.type, p.value]));
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10) % 24,
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
  };
}

/**
 * Конвертирует «локальное время в Москве» (`YYYY-MM-DD` + опционально
 * `HH:mm:ss[.SSS]`) в абсолютный момент `Date`. Алгоритм TZ-aware: считает
 * фактический offset Москвы через Intl, не зависит от хардкода `+03:00`.
 *
 * @example moscowLocalToDate("2026-05-07", "23:59:59.999")
 *          → Date соответствующий 23:59:59.999 МСК 7 мая 2026.
 */
export function moscowLocalToDate(dateStr: string, time = "00:00:00"): Date {
  const naive = new Date(`${dateStr}T${time}Z`);
  if (Number.isNaN(naive.getTime())) {
    throw new Error(`Invalid Moscow local datetime: ${dateStr}T${time}`);
  }
  // Что показывает Москва для UTC-момента `naive`? Если интерпретировать эти
  // компоненты заново как UTC — получим `mskAsUtc`. Разница `mskAsUtc − naive`
  // = текущий offset МСК относительно UTC (в мс, без учёта долей секунды).
  const p = moscowParts(naive);
  const mskAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offsetMs = mskAsUtc - Math.floor(naive.getTime() / 1000) * 1000;
  return new Date(naive.getTime() - offsetMs);
}

/**
 * 23:59:59.999 МСК указанного дня (`YYYY-MM-DD`) — для дедлайнов «до конца
 * дня» (sched. `expire-send-by`, `expire-pickup-by`).
 */
export function moscowEndOfDay(dateStr: string): Date {
  return moscowLocalToDate(dateStr, "23:59:59.999");
}

/**
 * Границы дня в Москве как ISO-строки — для SQL-фильтров `gte/lte`
 * (см. `aggregate-sales-stats`).
 */
export function moscowDayBoundsIso(dateStr: string): { start: string; end: string } {
  return {
    start: moscowLocalToDate(dateStr, "00:00:00").toISOString(),
    end: moscowLocalToDate(dateStr, "23:59:59.999").toISOString(),
  };
}

/**
 * Гибкий парсер: `YYYY-MM-DD` интерпретируется как 00:00 МСК того дня;
 * полный ISO с TZ — как есть. Используется в форматтерах карточек заказа
 * (`send_by`, `pickup_by` в БД хранятся как `DATE`, остальные timestamps —
 * с TZ).
 */
export function parseFlexibleDate(iso: string): Date {
  return iso.length <= 10 ? moscowLocalToDate(iso, "00:00:00") : new Date(iso);
}
