/**
 * Утилиты для расчёта окна уведомлений партнёра/директора.
 *
 * Окно настраивается владельцем (`business_settings.partner_notify_window_*`,
 * `business_settings.director_notify_window_*`, дефолт 10:00–22:00 МСК).
 * Используется в:
 *  - `partner-payment-reminder-job` — напоминание партнёру о неподтверждённой
 *    оплате. Если момент срабатывания вне окна — переносится на ближайшее
 *    начало окна.
 *  - `partner-payment-expire-job` — auto-cancel через 24ч. Окно НЕ учитывается
 *    (это эскалация, не уведомление).
 *  - `partner-receipts-digest` / `director-receipts-digest` — часовые тики,
 *    решение «отправить или skip» через `shouldFireDigestNow`.
 */

import { moscowLocalToDate, moscowParts } from "@/lib/utils/moscow-time";

export interface NotifyWindow {
  start: string; // "10:00:00"
  end: string; // "22:00:00"
}

function timeStrToSeconds(time: string): number {
  const [h, m, s] = time.split(":").map((p) => parseInt(p, 10));
  return h * 3600 + m * 60 + (s || 0);
}

function moscowSecondsOfDay(at: Date): number {
  const p = moscowParts(at);
  return p.hour * 3600 + p.minute * 60 + p.second;
}

/**
 * `at` находится внутри окна (с учётом МСК-времени)?
 */
export function isInsideNotifyWindow(at: Date, win: NotifyWindow): boolean {
  const now = moscowSecondsOfDay(at);
  return now >= timeStrToSeconds(win.start) && now < timeStrToSeconds(win.end);
}

/**
 * Вернёт ближайший момент **в МСК**, когда уведомление можно отправить.
 * Если `at` уже внутри окна — возвращает `at` без изменений.
 * Если раньше начала окна сегодня — возвращает сегодняшнее начало окна.
 * Если позже конца окна сегодня — возвращает завтрашнее начало окна.
 *
 * Параметр `end` пока не используется в расчёте — handler перепроверяет окно
 * при срабатывании, поэтому крайние случаи (reminder в 23:50 при окне до 22:00)
 * корректно отрабатывают на повторной попытке.
 */
export function nextSendableTime(at: Date, win: NotifyWindow): Date {
  if (isInsideNotifyWindow(at, win)) return at;

  const p = moscowParts(at);
  const startSec = timeStrToSeconds(win.start);
  const nowSec = p.hour * 3600 + p.minute * 60 + p.second;

  // Сегодня до начала окна → сегодня в start; иначе — завтра в start.
  const targetIsoDate =
    nowSec < startSec
      ? `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
      : (() => {
          const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
          d.setUTCDate(d.getUTCDate() + 1);
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        })();

  const [hh, mm, ss] = win.start.split(":").map((p) => parseInt(p, 10));
  const time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss || 0).padStart(2, "0")}`;
  return moscowLocalToDate(targetIsoDate, time);
}

/**
 * Сколько мс ждать с этого момента до момента, когда можно отправить.
 * Никогда не меньше 0.
 */
export function delayUntilSendable(now: Date, win: NotifyWindow): number {
  return Math.max(0, nextSendableTime(now, win).getTime() - now.getTime());
}

/**
 * Часовой digest-handler стреляет раз в час (cron `0 * * * *`). Эта функция
 * решает, нужно ли реально отправить digest на текущем тике.
 *
 * Условие: текущий час в МСК совпадает с одним из расчётных «должных»
 * часов = `[start_hour, start_hour + step, ..., end_hour]`, где границы —
 * целые часы из настроек окна.
 *
 * Примеры (step = 3):
 *   - окно 10:00–22:00 → отправляем в 10, 13, 16, 19, 22.
 *   - окно 9:00–21:00  → 9, 12, 15, 18, 21.
 *
 * Минуты окна игнорируются (округление до часа). Если хочется точнее —
 * нужен отдельный механизм, но владелец редко выставляет 10:30.
 */
export function shouldFireDigestNow(at: Date, win: NotifyWindow, stepHours: number): boolean {
  const safeStep = Math.max(1, Math.min(12, Math.round(stepHours || 3)));
  const currentHour = moscowParts(at).hour;
  const startHour = Math.floor(timeStrToSeconds(win.start) / 3600);
  const endHour = Math.floor(timeStrToSeconds(win.end) / 3600);

  if (currentHour < startHour || currentHour > endHour) return false;
  return (currentHour - startHour) % safeStep === 0;
}
