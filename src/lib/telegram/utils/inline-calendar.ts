/**
 * Переиспользуемый inline-календарь для customer-bot.
 *
 * Используется в wizard'е оформления возврата (pickup_by), в кнопке
 * «Изменить срок отправки» (send_by), в «Изменить срок забора» (pickup_by).
 *
 * Callback-data: `cal:<prefix>:nav:<YYYY-MM>` / `cal:<prefix>:pick:<YYYY-MM-DD>`.
 * `<prefix>` — короткий context-token. ⚠ Telegram ограничивает callback_data
 * 64 байтами, фиксированная часть (`cal:` + `:pick:` + дата 10 символов) = 20.
 * Поэтому prefix должен быть ≤ 44 байт. С UUID (36) на метку остаётся ~8 байт.
 * Используем: `rp-<uuid>` (return pickup_by), `es-<uuid>` (edit send_by),
 * `ep-<uuid>` (edit pickup_by). Обработчики регистрируются в местах потребления.
 */

import { InlineKeyboard } from "grammy";
import { moscowToday } from "@/lib/utils/moscow-time";

const RU_MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const RU_WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export interface CalendarOpts {
  /** Префикс callback-data: `cal:<prefix>:nav:...` / `cal:<prefix>:pick:...`. */
  prefix: string;
  /** Какой месяц показываем. Year — 4-digit, month — 0..11. */
  year: number;
  month: number;
  /** Min/max границы (ISO `YYYY-MM-DD`, включительно). */
  minDate: string;
  maxDate: string;
  /** Подсветить выбранную дату (опц.). */
  selectedDate?: string;
}

const TODAY_ISO = (): string => moscowToday();

export function isoToParts(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  return { year: y, month: m - 1, day: d };
}

export function partsToIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function startOfDay(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Построить inline-клавиатуру календаря на конкретный месяц.
 * Дни вне диапазона [minDate; maxDate] делаются неактивными (callback "noop").
 */
export function buildCalendar(opts: CalendarOpts): InlineKeyboard {
  const kb = new InlineKeyboard();
  const { prefix, year, month, minDate, maxDate, selectedDate } = opts;

  const minParts = isoToParts(minDate);
  const maxParts = isoToParts(maxDate);
  const minD = new Date(minParts.year, minParts.month, minParts.day);
  const maxD = new Date(maxParts.year, maxParts.month, maxParts.day);

  // Header: << Месяц Год >>
  const prevMonth = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month + 1, 1);
  const canPrev =
    prevMonth.getFullYear() > minParts.year ||
    (prevMonth.getFullYear() === minParts.year && prevMonth.getMonth() >= minParts.month);
  const canNext =
    nextMonth.getFullYear() < maxParts.year ||
    (nextMonth.getFullYear() === maxParts.year && nextMonth.getMonth() <= maxParts.month);

  const navLabel = (offset: number) => `${year}-${String(month + 1 + offset).padStart(2, "0")}`;

  if (canPrev) {
    const prevYear = prevMonth.getFullYear();
    const prevM = prevMonth.getMonth();
    kb.text("‹", `cal:${prefix}:nav:${prevYear}-${String(prevM + 1).padStart(2, "0")}`);
  } else {
    kb.text(" ", "noop");
  }

  kb.text(`${RU_MONTHS[month]} ${year}`, "noop");

  if (canNext) {
    const nextYear = nextMonth.getFullYear();
    const nextM = nextMonth.getMonth();
    kb.text("›", `cal:${prefix}:nav:${nextYear}-${String(nextM + 1).padStart(2, "0")}`);
  } else {
    kb.text(" ", "noop");
  }
  kb.row();

  // Weekday headers
  for (const w of RU_WEEKDAYS) kb.text(w, "noop");
  kb.row();

  // Days grid. Понедельник = 0 в нашей сетке (как в RU_WEEKDAYS).
  const first = startOfDay(year, month);
  // getDay(): 0=Sun..6=Sat. Преобразуем в 0=Mon..6=Sun.
  const firstDow = (first.getDay() + 6) % 7;
  const total = daysInMonth(year, month);

  // Pad before
  let cells = 0;
  for (let i = 0; i < firstDow; i++) {
    kb.text(" ", "noop");
    cells++;
  }

  for (let d = 1; d <= total; d++) {
    const dDate = new Date(year, month, d);
    const inRange = dDate >= minD && dDate <= maxD;
    const iso = partsToIso(year, month, d);
    const isSelected = selectedDate === iso;

    if (inRange) {
      const label = isSelected ? `·${d}·` : String(d);
      kb.text(label, `cal:${prefix}:pick:${iso}`);
    } else {
      kb.text(" ", "noop");
    }

    cells++;
    if (cells % 7 === 0) kb.row();
  }

  // Pad after to complete the last row
  while (cells % 7 !== 0) {
    kb.text(" ", "noop");
    cells++;
  }
  kb.row();

  // Cancel/close — последняя строка.
  kb.text("✖ Отмена", `cal:${prefix}:cancel`);

  return kb;
}

/**
 * Распарсить callback `cal:<prefix>:<action>:<arg>`.
 * Возвращает { prefix, action, arg }.
 */
export function parseCalendarCallback(
  data: string
): { prefix: string; action: "nav" | "pick" | "cancel"; arg: string } | null {
  const m = /^cal:([^:]+):(nav|pick|cancel)(?::(.+))?$/.exec(data);
  if (!m) return null;
  return {
    prefix: m[1],
    action: m[2] as "nav" | "pick" | "cancel",
    arg: m[3] ?? "",
  };
}

export const CalendarHelpers = {
  todayIso: TODAY_ISO,
  isoToParts,
  partsToIso,
};
