/**
 * Wizard оформления возврата + переоткрытия из trash + edit-actions
 * (обновить код/трек, изменить pickup_by, отменить возврат).
 *
 * BUSINESS_LOGIC.md §6.3, §12.5.
 *
 * Шаги wizard'а:
 *   1. Трек возврата (текст).
 *   2. Код возврата (текст; и для своих, и для партнёрских — клиент всегда указывает).
 *   3. pickup_by (inline-календарь, мин = сегодня, макс = business_settings.pickup_by_max_days).
 *   4. Подтверждение → UPDATE order, scheduleExpirePickupBy.
 *
 * Тексты — placeholder, переработка после первой smoke-сессии.
 */

import { InlineKeyboard } from "grammy";
import { getBotDb } from "../db";
import { buildCalendar, parseCalendarCallback } from "../utils/inline-calendar";
import { cancelExpirePickupBy } from "@/lib/jobs/queues";
import { appendStatusHistory } from "@/lib/orders/status-history";
import { moscowToday, parseFlexibleDate } from "@/lib/utils/moscow-time";
import type { Customer, CustomerContext, ReturnDraft } from "../bots/customer-bot";
import type { Json } from "@/types/database";

interface OrderForReturn {
  id: string;
  order_number: number;
  status: string;
  partner_id: string | null;
  return_attempts_count: number;
  customer_id: string | null;
  status_history: Json | null;
}

async function fetchOrder(orderId: string, customerId: string): Promise<OrderForReturn | null> {
  const db = getBotDb();
  const { data, error } = await db
    .from("orders")
    .select(
      "id, order_number, status, partner_id, return_attempts_count, customer_id, status_history"
    )
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .single();
  if (error || !data) return null;
  return data as unknown as OrderForReturn;
}

async function fetchPickupByMaxDays(): Promise<number> {
  const db = getBotDb();
  const { data } = await db
    .from("business_settings")
    .select("pickup_by_max_days")
    .limit(1)
    .single();
  return Number(data?.pickup_by_max_days ?? 21);
}

const todayMoscowIso = (): string => moscowToday();

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// =====================================================================
// Старт wizard'а: «Оформить возврат» / «Переоткрыть возврат»
// =====================================================================

/**
 * Запустить wizard оформления возврата (status=sent).
 * Доступно если status=sent.
 */
export async function startReturnWizard(
  ctx: CustomerContext,
  customer: Customer,
  orderId: string
): Promise<void> {
  const order = await fetchOrder(orderId, customer.id);
  if (!order) {
    await ctx.reply("Заказ не найден.");
    return;
  }

  if (order.status !== "sent") {
    await ctx.reply("Возврат можно оформить только для отправленного заказа.");
    return;
  }

  if (order.return_attempts_count >= 2) {
    await ctx.reply("Лимит оформлений возврата исчерпан.");
    return;
  }

  ctx.session.returnDraft = {
    orderId: order.id,
    isReopen: false,
    isPartner: order.partner_id !== null,
    startedAt: new Date().toISOString(),
  };
  ctx.session.step = "return_awaiting_tracking";

  await ctx.reply(
    `↩️ Оформляем возврат по заказу №${order.order_number}.\n\n` +
      `Шаг 1/3 — пришли трек-номер возврата текстом.`,
    { reply_markup: cancelReturnKeyboard() }
  );
}

/**
 * Перезапуск wizard'а из trash (status=trash, return_attempts_count<2).
 * После успеха: return_attempts_count := 2.
 */
export async function startReopenWizard(
  ctx: CustomerContext,
  customer: Customer,
  orderId: string
): Promise<void> {
  const order = await fetchOrder(orderId, customer.id);
  if (!order) {
    await ctx.reply("Заказ не найден.");
    return;
  }

  if (order.status !== "trash") {
    await ctx.reply("Переоткрыть можно только заказ из «утиля».");
    return;
  }

  if (order.return_attempts_count >= 2) {
    await ctx.reply("Лимит переоткрытий возврата исчерпан.");
    return;
  }

  ctx.session.returnDraft = {
    orderId: order.id,
    isReopen: true,
    isPartner: order.partner_id !== null,
    startedAt: new Date().toISOString(),
  };
  ctx.session.step = "return_awaiting_tracking";

  await ctx.reply(
    `🔄 Переоткрываем возврат по заказу №${order.order_number}.\n\n` +
      `Возврат был утерян, попробуем ещё раз. Шаг 1/3 — пришли новый трек возврата текстом.`,
    { reply_markup: cancelReturnKeyboard() }
  );
}

function cancelReturnKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("✖ Отменить оформление", "return:wizard:cancel");
}

// =====================================================================
// Шаг 1: трек
// =====================================================================

export async function handleReturnTrackingInput(ctx: CustomerContext, text: string): Promise<void> {
  const draft = ctx.session.returnDraft;
  if (!draft) {
    ctx.session.step = undefined;
    return;
  }

  const tracking = text.trim();
  if (tracking.length < 4 || tracking.length > 64) {
    await ctx.reply("Похоже на неверный трек. Пришли ещё раз — обычно это 8–24 символа.");
    return;
  }

  draft.trackingNumber = tracking;
  ctx.session.step = "return_awaiting_code";

  await ctx.reply(`Шаг 2/3 — пришли текущий код возврата, который выдала Авито.`, {
    reply_markup: cancelReturnKeyboard(),
  });
}

// =====================================================================
// Шаг 2: код
// =====================================================================

export async function handleReturnCodeInput(ctx: CustomerContext, text: string): Promise<void> {
  const draft = ctx.session.returnDraft;
  if (!draft) {
    ctx.session.step = undefined;
    return;
  }

  const code = text.trim();
  if (code.length < 1 || code.length > 32) {
    await ctx.reply("Похоже на неверный код. Пришли ещё раз.");
    return;
  }

  draft.returnCode = code;
  ctx.session.step = "return_awaiting_pickup_by";
  await sendReturnCalendar(ctx, draft);
}

// =====================================================================
// Шаг 3: pickup_by — inline-календарь
// =====================================================================

async function sendReturnCalendar(
  ctx: CustomerContext,
  draft: ReturnDraft,
  showMonth?: { year: number; month: number }
): Promise<void> {
  const today = todayMoscowIso();
  const maxDays = await fetchPickupByMaxDays();
  const maxDate = addDaysIso(today, maxDays);

  // Дефолт показа — текущий месяц.
  const [yy, mm] = today.split("-");
  const month = showMonth ?? { year: parseInt(yy, 10), month: parseInt(mm, 10) - 1 };
  draft.calendarMonth = month;

  const kb = buildCalendar({
    prefix: `rp-${draft.orderId}`,
    year: month.year,
    month: month.month,
    minDate: today,
    maxDate,
  });

  await ctx.reply(
    `Шаг 3/3 — выбери дату, до которой можно забрать посылку с ПВЗ.\n\n` +
      `Окно: с ${formatDateRu(today)} по ${formatDateRu(maxDate)}.`,
    { reply_markup: kb }
  );
}

/**
 * Обработчик callback'ов inline-календаря wizard'а возврата.
 * Регистрируется в customer-bot.ts: bot.callbackQuery(/^cal:rp-/, handleReturnCalendar).
 */
export async function handleReturnCalendarCallback(
  ctx: CustomerContext,
  customer: Customer
): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const parsed = parseCalendarCallback(data);
  if (!parsed) {
    await ctx.answerCallbackQuery();
    return;
  }

  const draft = ctx.session.returnDraft;
  if (!draft || !parsed.prefix.startsWith("rp-")) {
    await ctx.answerCallbackQuery();
    return;
  }

  if (parsed.action === "cancel") {
    await ctx.answerCallbackQuery();
    ctx.session.returnDraft = undefined;
    ctx.session.step = undefined;
    try {
      await ctx.deleteMessage();
    } catch {}
    await ctx.reply("Оформление возврата отменено.");
    return;
  }

  if (parsed.action === "nav") {
    const [yStr, mStr] = parsed.arg.split("-");
    const showMonth = { year: parseInt(yStr, 10), month: parseInt(mStr, 10) - 1 };

    const today = todayMoscowIso();
    const maxDays = await fetchPickupByMaxDays();
    const maxDate = addDaysIso(today, maxDays);

    const kb = buildCalendar({
      prefix: parsed.prefix,
      year: showMonth.year,
      month: showMonth.month,
      minDate: today,
      maxDate,
    });

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: kb });
    } catch {
      // ignore
    }
    await ctx.answerCallbackQuery();
    return;
  }

  if (parsed.action === "pick") {
    await ctx.answerCallbackQuery();
    await finalizeReturnWizard(ctx, customer, draft, parsed.arg);
  }
}

// =====================================================================
// Финал: создаём возврат
// =====================================================================

async function finalizeReturnWizard(
  ctx: CustomerContext,
  customer: Customer,
  draft: ReturnDraft,
  pickupByIso: string
): Promise<void> {
  const db = getBotDb();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, order_number, status, return_attempts_count, status_history, partner_id, is_paid, client_price, partner:partners(tg_username, name)"
    )
    .eq("id", draft.orderId)
    .eq("customer_id", customer.id)
    .single();

  if (!order) {
    await ctx.reply("Заказ не найден.");
    return;
  }

  if (
    (draft.isReopen && order.status !== "trash") ||
    (!draft.isReopen && order.status !== "sent")
  ) {
    await ctx.reply(
      `Статус заказа изменился на «${order.status}» — оформление возврата невозможно.`
    );
    ctx.session.returnDraft = undefined;
    ctx.session.step = undefined;
    return;
  }

  // Окно для адаптивных порогов попыток (BUSINESS_LOGIC §6.6).
  const today = todayMoscowIso();
  const windowDays = Math.max(0, daysBetween(today, pickupByIso));

  // Если переоткрытие — выставляем return_attempts_count = 2 (третьего раза не будет).
  // Если первое оформление — инкрементируем (0 → 1).
  const newAttempts = draft.isReopen ? 2 : (order.return_attempts_count ?? 0) + 1;

  const { error } = await db
    .from("orders")
    .update({
      status: "return",
      return_tracking_number: draft.trackingNumber,
      return_code: draft.returnCode,
      return_code_updated_at: new Date().toISOString(),
      pickup_by: pickupByIso,
      return_window_days: windowDays,
      return_attempts_count: newAttempts,
      status_history: appendStatusHistory(order.status_history, "return", {
        from: draft.isReopen ? "trash" : "sent",
        is_reopen: draft.isReopen,
      }),
    })
    .eq("id", order.id);

  if (error) {
    console.error("[return-wizard] update failed:", error);
    await ctx.reply("Не удалось оформить возврат. Попробуй позже.");
    return;
  }

  // Сгорание pickup_by обслуживает sweep-pickup-by-daily в 00:03 МСК
  // (sweep-expired-orders.ts). Per-order BullMQ-job больше не ставится.

  ctx.session.returnDraft = undefined;
  ctx.session.step = undefined;

  try {
    await ctx.deleteMessage();
  } catch {}

  // Heads-up по возврату денег. Для партнёрского — деньги вернёт партнёр
  // напрямую; для owner — баланс пополнится автоматом при приёме на ПВЗ.
  let refundHeadsUp = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderAny = order as any;
  if (orderAny.is_paid && orderAny.client_price) {
    if (orderAny.partner_id) {
      const partner = orderAny.partner as {
        tg_username: string | null;
        name: string | null;
      } | null;
      const partnerLabel = partner?.tg_username
        ? `@${partner.tg_username.replace(/^@/, "")}`
        : (partner?.name ?? "партнёр");
      const { data: settings } = await db
        .from("business_settings")
        .select("support_telegram_username")
        .limit(1)
        .maybeSingle();
      const supportUsername = (settings?.support_telegram_username as string | null) ?? null;
      const supportLine = supportUsername
        ? `\nЕсли возникнут проблемы — пиши в поддержку: @${supportUsername.replace(/^@/, "")}`
        : "";
      refundHeadsUp = `\n\n💰 Когда возврат примут на ПВЗ — деньги вернёт партнёр напрямую: ${partnerLabel} — свяжись с ним и обсуди реквизиты для возврата.${supportLine}`;
    } else {
      refundHeadsUp = `\n\n💰 Когда возврат примут на ПВЗ — деньги вернутся на твой баланс.`;
    }
  }

  await ctx.reply(
    `✅ Возврат по заказу №${order.order_number} оформлен.\n\n` +
      `Трек: <code>${escapeHtml(draft.trackingNumber ?? "")}</code>\n` +
      `Код: <code>${escapeHtml(draft.returnCode ?? "")}</code>\n` +
      `Забрать до: <b>${formatDateRu(pickupByIso)}</b>${
        draft.isReopen ? "\n\n<i>Это последняя попытка — переоткрыть после неё нельзя.</i>" : ""
      }${refundHeadsUp}`,
    { parse_mode: "HTML" }
  );
}

// =====================================================================
// Edit-actions: обновить код / трек / pickup_by / отменить возврат
// =====================================================================

export async function startEditReturnCode(
  ctx: CustomerContext,
  customer: Customer,
  orderId: string
): Promise<void> {
  const order = await fetchOrder(orderId, customer.id);
  if (!order || order.status !== "return") {
    await ctx.reply("Можно обновить код только для активного возврата.");
    return;
  }
  ctx.session.editReturnFieldOrderId = orderId;
  ctx.session.step = "awaiting_return_code_update";
  await ctx.reply("Пришли новый код возврата текстом.");
}

export async function startEditReturnTrack(
  ctx: CustomerContext,
  customer: Customer,
  orderId: string
): Promise<void> {
  const order = await fetchOrder(orderId, customer.id);
  if (!order || order.status !== "return") {
    await ctx.reply("Можно обновить трек только для активного возврата.");
    return;
  }
  ctx.session.editReturnFieldOrderId = orderId;
  ctx.session.step = "awaiting_return_track_update";
  await ctx.reply("Пришли новый трек возврата текстом.");
}

export async function handleEditReturnCodeInput(
  ctx: CustomerContext,
  customer: Customer,
  text: string
): Promise<void> {
  const orderId = ctx.session.editReturnFieldOrderId;
  if (!orderId) {
    ctx.session.step = undefined;
    return;
  }
  const code = text.trim();
  if (code.length < 1 || code.length > 32) {
    await ctx.reply("Похоже на неверный код. Пришли ещё раз.");
    return;
  }

  const db = getBotDb();
  const { error } = await db
    .from("orders")
    .update({ return_code: code, return_code_updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .eq("status", "return");

  ctx.session.editReturnFieldOrderId = undefined;
  ctx.session.step = undefined;

  if (error) {
    await ctx.reply("Не удалось обновить код. Попробуй позже.");
    return;
  }
  await ctx.reply("Код возврата обновлён. ✅");
}

export async function handleEditReturnTrackInput(
  ctx: CustomerContext,
  customer: Customer,
  text: string
): Promise<void> {
  const orderId = ctx.session.editReturnFieldOrderId;
  if (!orderId) {
    ctx.session.step = undefined;
    return;
  }
  const tracking = text.trim();
  if (tracking.length < 4 || tracking.length > 64) {
    await ctx.reply("Похоже на неверный трек. Пришли ещё раз.");
    return;
  }

  const db = getBotDb();
  const { error } = await db
    .from("orders")
    .update({ return_tracking_number: tracking })
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .eq("status", "return");

  ctx.session.editReturnFieldOrderId = undefined;
  ctx.session.step = undefined;

  if (error) {
    await ctx.reply("Не удалось обновить трек. Попробуй позже.");
    return;
  }
  await ctx.reply("Трек возврата обновлён. ✅");
}

/**
 * Отмена возврата клиентом. Канон §6.3: до первой попытки забора.
 * Если уже была попытка — отказ (но return_attempts_count не сбрасываем).
 */
export async function cancelReturn(
  ctx: CustomerContext,
  customer: Customer,
  orderId: string
): Promise<void> {
  const db = getBotDb();
  const order = await fetchOrder(orderId, customer.id);
  if (!order || order.status !== "return") {
    await ctx.reply("Возврат не активен — отменять нечего.");
    return;
  }

  // Проверяем были ли попытки забора.
  const { count } = await db
    .from("return_pickup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);

  if ((count ?? 0) > 0) {
    await ctx.reply(
      "Отменить возврат уже нельзя — отправщик выезжал на ПВЗ. Дождись завершения процесса."
    );
    return;
  }

  // pickup_by теперь NOT NULL (миграция 20260526000041). Не зануляем —
  // при возврате в sent поле остаётся как есть (для возврата уже не
  // используется), null не нужен и невозможен.
  const { error } = await db
    .from("orders")
    .update({
      status: "sent",
      return_window_days: null,
      status_history: appendStatusHistory(order.status_history, "sent", {
        from: "return",
        reason: "client_cancelled",
      }),
    })
    .eq("id", orderId)
    .eq("status", "return");

  if (error) {
    await ctx.reply("Не удалось отменить возврат. Попробуй позже.");
    return;
  }

  cancelExpirePickupBy(orderId).catch((e) =>
    console.error("[return-wizard] cancelExpirePickupBy failed:", e)
  );

  await ctx.reply(
    "Возврат отменён. Заказ снова в статусе «отправлен». " +
      `Можно оформить новый возврат, но осталась только ${2 - order.return_attempts_count} попытка.`
  );
}

// =====================================================================
// Утилиты
// =====================================================================

function formatDateRu(iso: string): string {
  return parseFlexibleDate(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map((p) => parseInt(p, 10));
  const [ty, tm, td] = toIso.split("-").map((p) => parseInt(p, 10));
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
