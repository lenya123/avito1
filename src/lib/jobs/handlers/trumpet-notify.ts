/**
 * Обработчик trumpet-notify — DM клиенту с заказами в return.
 *
 * Канон BUSINESS_LOGIC.md §6.4 + memory `trumpet_notify_design.md`.
 *
 * Расписание (от момента нажатия «Протрубить»):
 *   #1 — сразу
 *   #2 — +30 мин
 *   #3 — +1 ч
 *   #4 — +2 ч (тон «не буду беспокоить, напомню через 3 часа»)
 *   #5+ — каждые 3 часа до 21:00 МСК
 *
 * Окно: 10:00–21:00 МСК. Если delay-job попадает за окно — пропускаем.
 *
 * Stop-условие (at-runtime в каждом job):
 *   - Сессия trumpet отменена → skip.
 *   - У клиента нет заказов в return с `return_code_updated_at < trigger_time`
 *     (т.е. клиент уже обновил код по всем своим возвратам) → skip.
 *
 * Один DM на клиента — со списком всех его открытых возвратов.
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { getCustomerBot } from "@/lib/telegram";
import { moscowParts } from "@/lib/utils/moscow-time";

export interface TrumpetNotifyJobData {
  trumpetSessionId: string;
  customerId: string;
  /** Порядковый номер сообщения в серии (1..N). Используется для текста. */
  sequence: number;
}

const DEFAULT_WINDOW_START = "10:00:00";
const DEFAULT_WINDOW_END = "21:00:00";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

/**
 * Проверка: сейчас МСК-час входит в окно `[start, end)` из business_settings?
 * Окно общее для shipper-trumpet и partner-trumpet — это всегда контакт с
 * клиентом, спокойный диапазон 10:00–21:00 МСК по дефолту.
 */
function isWithinWindow(start: string, end: string): boolean {
  const hour = moscowParts().hour;
  const startHour = parseInt(start.split(":")[0], 10);
  const endHour = parseInt(end.split(":")[0], 10);
  return hour >= startHour && hour < endHour;
}

interface TextContext {
  /** Кто едет на ПВЗ — отправщик владельца или партнёр. */
  picker: "shipper" | "partner";
  /** `@username` нашей поддержки — добавляется в партнёрский вариант
   *  на случай некорректного поведения партнёра. NULL → строка не добавляется. */
  supportUsername: string | null;
}

/**
 * Тексты по sequence. Базовая структура та же, заголовок и подпись зависят
 * от того, кто именно едет на ПВЗ за возвратами (отправщик владельца vs
 * партнёр). Финальная редактура — в конце фазы 1.
 */
function buildText(sequence: number, orderNumbers: number[], ctx: TextContext): string {
  const list = orderNumbers.map((n) => `• Заказ №${n}`).join("\n");
  const subject = ctx.picker === "partner" ? "партнёр" : "отправщик";
  const supportLine =
    ctx.picker === "partner" && ctx.supportUsername
      ? `\n\nЕсли возникнут проблемы — пиши в поддержку: @${ctx.supportUsername.replace(/^@/, "")}`
      : "";

  switch (sequence) {
    case 1:
      return (
        `🚚 Сегодня ${subject} едет за возвратами на ПВЗ.\n\n` +
        `Если код возврата изменился — обнови его в карточке заказа («Мои заказы» → заказ → «Обновить код возврата»).\n\n` +
        `Открытые возвраты:\n${list}${supportLine}`
      );
    case 2:
      return (
        `Прошло полчаса — как успехи? 🤔\n\n` +
        `${subject[0].toUpperCase() + subject.slice(1)} уже на ПВЗ. Если код актуален — отлично, ничего делать не нужно. Если изменился — обнови в карточке заказа.\n\n` +
        `${list}${supportLine}`
      );
    case 3:
      return (
        `Уже целый час прошёл, а ${subject} не может забрать твои возвраты — нужен актуальный код возврата.\n\n` +
        `${list}\n\n` +
        `Открой «Мои заказы» → выбери возврат → «Обновить код возврата».${supportLine}`
      );
    case 4:
      return (
        `Понял, видимо ты сильно занят. Не буду беспокоить.\n\n` +
        `Напомню ещё раз через 3 часа — ${subject} всё ещё ждёт твой код возврата.\n\n` +
        `${list}${supportLine}`
      );
    default:
      return (
        `⏳ ${subject[0].toUpperCase() + subject.slice(1)} всё ещё ждёт актуальные коды возврата.\n\n` +
        `${list}\n\n` +
        `Чем раньше пришлёшь — тем больше шансов забрать сегодня.${supportLine}`
      );
  }
}

export async function handleTrumpetNotify(job: Job<TrumpetNotifyJobData>): Promise<void> {
  const { trumpetSessionId, customerId, sequence } = job.data;
  const supabase = getServiceClient();

  // 1. Окно из настроек (по дефолту 10:00–21:00 МСК). Одна общая настройка
  //    для shipper-trumpet и partner-trumpet.
  const { data: windowSettings } = await supabase
    .from("business_settings")
    .select("trumpet_notify_window_start, trumpet_notify_window_end")
    .limit(1)
    .maybeSingle();
  const windowStart =
    (windowSettings?.trumpet_notify_window_start as string | null) ?? DEFAULT_WINDOW_START;
  const windowEnd =
    (windowSettings?.trumpet_notify_window_end as string | null) ?? DEFAULT_WINDOW_END;

  if (!isWithinWindow(windowStart, windowEnd)) {
    console.log(
      `[trumpet-notify] outside window (sequence=${sequence}, customer=${customerId}) — skip`
    );
    return;
  }

  // 2. Сессия trumpet активна (не отменена)?
  const { data: session } = await supabase
    .from("trumpet_sessions")
    .select("id, triggered_at, cancelled_at, partner_id")
    .eq("id", trumpetSessionId)
    .single();
  if (!session) return;
  if (session.cancelled_at) {
    console.log(`[trumpet-notify] session ${trumpetSessionId} cancelled — skip`);
    return;
  }

  const triggeredAt = (session.triggered_at as string) ?? new Date().toISOString();
  const sessionPartnerId = (session.partner_id as string | null) ?? null;

  // 3. Активные возвраты клиента, по которым код ещё не обновлён после trumpet.
  // Для партнёрской сессии — только заказы этого партнёра.
  let ordersQuery = supabase
    .from("orders")
    .select("id, order_number, return_code_updated_at")
    .eq("customer_id", customerId)
    .eq("status", "return");
  if (sessionPartnerId) {
    ordersQuery = ordersQuery.eq("partner_id", sessionPartnerId);
  }
  const { data: orders } = await ordersQuery;

  const pending = (orders ?? []).filter((o) => {
    const upd = o.return_code_updated_at as string | null;
    if (!upd) return true;
    return new Date(upd).getTime() < new Date(triggeredAt).getTime();
  });

  if (pending.length === 0) {
    console.log(
      `[trumpet-notify] customer ${customerId} updated all codes — skip sequence ${sequence}`
    );
    return;
  }

  // 4. Получаем tg_user_id клиента.
  const { data: customer } = await supabase
    .from("customers")
    .select("tg_user_id")
    .eq("id", customerId)
    .single();
  if (!customer?.tg_user_id) return;

  // 5. Контекст текста (партнёрский vs owner).
  let supportUsername: string | null = null;
  if (sessionPartnerId) {
    const { data: settings } = await supabase
      .from("business_settings")
      .select("support_telegram_username")
      .limit(1)
      .maybeSingle();
    supportUsername = (settings?.support_telegram_username as string | null) ?? null;
  }

  const numbers = pending.map((o) => o.order_number as number).sort((a, b) => a - b);
  const text = buildText(sequence, numbers, {
    picker: sessionPartnerId ? "partner" : "shipper",
    supportUsername,
  });

  try {
    const bot = getCustomerBot();
    await bot.api.sendMessage(customer.tg_user_id, text);
    console.log(
      `[trumpet-notify] sent #${sequence} to customer ${customerId} (${pending.length} orders)`
    );
  } catch (err) {
    console.error(`[trumpet-notify] sendMessage failed:`, err);
  }
}
