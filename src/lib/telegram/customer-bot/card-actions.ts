/**
 * Edit-actions для карточки заказа в customer-bot:
 *   - Изменить срок отправки (send_by) — для paid/collecting.
 *   - Изменить срок забора (pickup_by) — для return.
 *   - Отменить заказ — для paid/collecting/problem.
 *
 * BUSINESS_LOGIC.md §4.5, §12.5.
 */

import { getBotDb } from "../db";
import { buildCalendar, parseCalendarCallback } from "../utils/inline-calendar";
import { cancelExpireSendBy, cancelExpireUnpaidOrder } from "@/lib/jobs/queues";
import { appendStatusHistory } from "@/lib/orders/status-history";
import { sendToPartner, notifyPartnerOrderRefundDue } from "@/lib/telegram/notifications";
import { resolvePartnerRefundContext } from "@/lib/orders/partner-refund-context";
import { moscowTimeNow, moscowToday, parseFlexibleDate } from "@/lib/utils/moscow-time";
import type { Customer, CustomerContext } from "../bots/customer-bot";

/**
 * Окно для «Изменить срок отправки» — 14 дней от даты создания заказа.
 * Это шире чем send_by_max_days (потолок при оформлении), и считается
 * не от сегодняшнего дня, а от created_at — клиент не может бесконечно
 * двигать срок, но в пределах 2 недель с создания может скорректировать.
 */
const SEND_BY_EDIT_WINDOW_DAYS = 14;

function isoDateOnly(iso: string): string {
  return iso.length <= 10 ? iso : iso.slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateRu(iso: string): string {
  return parseFlexibleDate(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

async function fetchSettings(): Promise<{
  send_by_today_cutoff: string;
  send_by_max_days: number;
  pickup_by_max_days: number;
}> {
  const db = getBotDb();
  const { data } = await db
    .from("business_settings")
    .select("send_by_today_cutoff, send_by_max_days, pickup_by_max_days")
    .limit(1)
    .single();
  return {
    send_by_today_cutoff: (data?.send_by_today_cutoff as string) ?? "16:00:00",
    send_by_max_days: Number(data?.send_by_max_days ?? 7),
    pickup_by_max_days: Number(data?.pickup_by_max_days ?? 21),
  };
}

/**
 * Сегодняшняя дата как минимум для send_by, если ещё не cutoff;
 * иначе — завтра (BUSINESS_LOGIC §4.5).
 */
function sendByMinDate(cutoff: string): string {
  const today = moscowToday();
  return moscowTimeNow() < cutoff ? today : addDaysIso(today, 1);
}

// =====================================================================
// Изменить срок отправки (send_by) — paid/collecting
// =====================================================================

export async function startEditSendBy(
  ctx: CustomerContext,
  customer: Customer,
  orderId: string
): Promise<void> {
  const db = getBotDb();
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, status, send_by, created_at")
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .single();

  if (!order || !["paid", "collecting"].includes(order.status as string)) {
    await ctx.reply("Срок отправки можно менять только для активных заказов.");
    return;
  }
  if (!order.created_at) {
    await ctx.reply("Не удалось определить дату создания заказа.");
    return;
  }

  const settings = await fetchSettings();
  const minDate = sendByMinDate(settings.send_by_today_cutoff);
  // Окно — 14 дней от даты создания заказа (не от сегодня).
  const maxDate = addDaysIso(isoDateOnly(order.created_at as string), SEND_BY_EDIT_WINDOW_DAYS);

  if (maxDate < minDate) {
    await ctx.reply(
      `Окно изменения срока отправки (${SEND_BY_EDIT_WINDOW_DAYS} дней с создания заказа) уже истекло. ` +
        `Если нужна помощь — напиши в поддержку.`
    );
    return;
  }

  const [yy, mm] = minDate.split("-");
  const kb = buildCalendar({
    // короткий prefix — Telegram callback_data ограничен 64 байтами
    prefix: `es-${order.id}`,
    year: parseInt(yy, 10),
    month: parseInt(mm, 10) - 1,
    minDate,
    maxDate,
    selectedDate: (order.send_by as string) ?? undefined,
  });

  await ctx.reply(
    `📅 Заказ №${order.order_number} — выбери новый срок отправки.\n\n` +
      `Окно: с ${formatDateRu(minDate)} по ${formatDateRu(maxDate)}.`,
    { reply_markup: kb }
  );
}

export async function startEditPickupBy(
  ctx: CustomerContext,
  customer: Customer,
  orderId: string
): Promise<void> {
  const db = getBotDb();
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, status, pickup_by")
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .single();

  if (!order || order.status !== "return") {
    await ctx.reply("Срок забора можно менять только для активного возврата.");
    return;
  }

  const settings = await fetchSettings();
  const today = moscowToday();
  const maxDate = addDaysIso(today, settings.pickup_by_max_days);

  const [yy, mm] = today.split("-");
  const kb = buildCalendar({
    prefix: `ep-${order.id}`,
    year: parseInt(yy, 10),
    month: parseInt(mm, 10) - 1,
    minDate: today,
    maxDate,
    selectedDate: (order.pickup_by as string) ?? undefined,
  });

  await ctx.reply(
    `📅 Возврат №${order.order_number} — выбери новую дату забора.\n\n` +
      `Окно: с ${formatDateRu(today)} по ${formatDateRu(maxDate)}.`,
    { reply_markup: kb }
  );
}

/**
 * Обработчик callback'ов inline-календаря для edit-actions
 * (`cal:es-<id>:...` для send_by или `cal:ep-<id>:...` для pickup_by).
 */
export async function handleCardCalendarCallback(
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

  // prefix format: `es-<orderId>` (editsendby) или `ep-<orderId>` (editpickupby)
  const m = /^(es|ep)-(.+)$/.exec(parsed.prefix);
  if (!m) {
    await ctx.answerCallbackQuery();
    return;
  }
  const kind: "editsendby" | "editpickupby" = m[1] === "es" ? "editsendby" : "editpickupby";
  const orderId = m[2];

  if (parsed.action === "cancel") {
    await ctx.answerCallbackQuery();
    try {
      await ctx.deleteMessage();
    } catch {}
    return;
  }

  if (parsed.action === "nav") {
    const [yStr, mStr] = parsed.arg.split("-");
    const showMonth = { year: parseInt(yStr, 10), month: parseInt(mStr, 10) - 1 };

    const settings = await fetchSettings();
    const minDate =
      kind === "editsendby" ? sendByMinDate(settings.send_by_today_cutoff) : moscowToday();

    let maxDate: string;
    if (kind === "editsendby") {
      // Окно editsendby = created_at + SEND_BY_EDIT_WINDOW_DAYS, читаем заново.
      const db = getBotDb();
      const { data: order } = await db
        .from("orders")
        .select("created_at")
        .eq("id", orderId)
        .eq("customer_id", customer.id)
        .single();
      const createdAt = order?.created_at as string | null;
      if (!createdAt) {
        await ctx.answerCallbackQuery();
        return;
      }
      maxDate = addDaysIso(isoDateOnly(createdAt), SEND_BY_EDIT_WINDOW_DAYS);
    } else {
      maxDate = addDaysIso(moscowToday(), settings.pickup_by_max_days);
    }

    const kb = buildCalendar({
      prefix: parsed.prefix,
      year: showMonth.year,
      month: showMonth.month,
      minDate,
      maxDate,
    });
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: kb });
    } catch {}
    await ctx.answerCallbackQuery();
    return;
  }

  if (parsed.action === "pick") {
    await ctx.answerCallbackQuery();
    if (kind === "editsendby") {
      await applyEditSendBy(ctx, customer, orderId, parsed.arg);
    } else {
      await applyEditPickupBy(ctx, customer, orderId, parsed.arg);
    }
  }
}

async function applyEditSendBy(
  ctx: CustomerContext,
  customer: Customer,
  orderId: string,
  newSendBy: string
): Promise<void> {
  const db = getBotDb();
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, status, created_at")
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .single();

  if (!order || !["paid", "collecting"].includes(order.status as string)) {
    await ctx.reply("Срок отправки уже нельзя изменить — статус заказа изменился.");
    return;
  }

  // Защита от stale callback / подмены: дата должна быть в окне created_at + 14.
  if (order.created_at) {
    const maxAllowed = addDaysIso(
      isoDateOnly(order.created_at as string),
      SEND_BY_EDIT_WINDOW_DAYS
    );
    if (newSendBy > maxAllowed) {
      await ctx.reply(
        `Дата вне окна — можно выбрать максимум по ${formatDateRu(maxAllowed)} (14 дней с создания заказа).`
      );
      return;
    }
  }
  if (newSendBy < moscowToday()) {
    await ctx.reply("Нельзя выбрать прошедшую дату.");
    return;
  }

  const { error } = await db
    .from("orders")
    .update({ send_by: newSendBy })
    .eq("id", orderId)
    .in("status", ["paid", "collecting"]);

  if (error) {
    await ctx.reply("Не удалось изменить срок отправки.");
    return;
  }

  try {
    await ctx.deleteMessage();
  } catch {}
  await ctx.reply(`✅ Срок отправки заказа №${order.order_number} — ${formatDateRu(newSendBy)}.`);
}

async function applyEditPickupBy(
  ctx: CustomerContext,
  customer: Customer,
  orderId: string,
  newPickupBy: string
): Promise<void> {
  const db = getBotDb();
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, status, status_history")
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .single();

  if (!order || order.status !== "return") {
    await ctx.reply("Срок забора уже нельзя изменить — возврат не активен.");
    return;
  }

  // Пересчитываем return_window_days от сегодня до новой даты.
  const today = moscowToday();
  const windowDays = Math.max(0, daysBetween(today, newPickupBy));

  const { error } = await db
    .from("orders")
    .update({
      pickup_by: newPickupBy,
      return_window_days: windowDays,
    })
    .eq("id", orderId)
    .eq("status", "return");

  if (error) {
    await ctx.reply("Не удалось изменить срок забора.");
    return;
  }

  // Сгорание pickup_by обслуживает sweep-pickup-by-daily в 00:03 МСК
  // (sweep-expired-orders.ts). Per-order BullMQ-job больше не ставится —
  // достаточно UPDATE поля, новый pickup_by sweep подхватит.

  try {
    await ctx.deleteMessage();
  } catch {}
  await ctx.reply(`✅ Срок забора возврата №${order.order_number} — ${formatDateRu(newPickupBy)}.`);
}

// =====================================================================
// Отменить заказ — единый handler.
// Ветвление по (status, is_paid):
//   • paid + is_paid=false (+ВАЙБ-долг или ждём чека) → release stock,
//     отменить expire-unpaid-order, уведомить партнёра.
//   • paid|collecting|problem + is_paid=true → отменить expire-send-by,
//     Phase F refund на customer_balance.
// =====================================================================

export async function cancelOrder(
  ctx: CustomerContext,
  customer: Customer,
  orderId: string
): Promise<void> {
  const db = getBotDb();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, order_number, status, status_history, product_size_id, partner_id, is_paid, client_price"
    )
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .single();

  if (!order) {
    await ctx.reply("Заказ не найден.");
    return;
  }

  const cancellableStatuses = ["paid", "collecting", "problem"];
  if (!cancellableStatuses.includes(order.status as string)) {
    await ctx.reply("Этот заказ уже нельзя отменить.");
    return;
  }

  const { error } = await db
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: "customer_cancelled",
      status_history: appendStatusHistory(order.status_history, "cancelled", {
        from: order.status as string,
        reason: "customer_cancelled",
      }),
    })
    .eq("id", orderId)
    .in("status", cancellableStatuses);

  if (error) {
    await ctx.reply("Не удалось отменить заказ.");
    return;
  }

  if (order.is_paid && order.client_price > 0) {
    // Оплачен — снимаем send-by-таймер. Финансовая ветка зависит от источника.
    cancelExpireSendBy(orderId).catch((e) =>
      console.error("[card-actions] cancelExpireSendBy failed:", e)
    );

    if (order.partner_id) {
      // Партнёрский: партнёр получил деньги от клиента → партнёр сам возвращает.
      // Клиенту контакт партнёра + поддержки; партнёру контакт клиента + поддержки.
      const ctxData = await resolvePartnerRefundContext(db, order.partner_id, customer.id);
      if (ctxData) {
        await Promise.all([
          notifyPartnerOrderRefundDue({
            partnerId: order.partner_id,
            orderNumber: order.order_number,
            amount: order.client_price,
            customerLabel: ctxData.customerLabel,
            supportUsername: ctxData.supportUsername,
            kind: "cancelled",
          }).catch((e) => console.error("[card-actions] notify partner refund failed:", e)),
        ]);
        const supportLine = ctxData.supportUsername
          ? `\nЕсли возникнут проблемы — пиши в поддержку: @${ctxData.supportUsername.replace(/^@/, "")}`
          : "";
        await ctx.reply(
          `❌ Заказ №${order.order_number} отменён.\n\n` +
            `💰 Деньги возвращает партнёр напрямую: ${ctxData.partnerLabel} — свяжись с ним и обсуди реквизиты для возврата.${supportLine}`
        );
      } else {
        // Не подгрузились контакты — минимальное сообщение.
        await ctx.reply(`❌ Заказ №${order.order_number} отменён.`);
      }
      if (ctx.session.awaitingReceiptForOrderId === orderId) {
        ctx.session.awaitingReceiptForOrderId = undefined;
      }
      return;
    }

    // Owner-source: возвращаем деньги на баланс через RPC (идемпотентна по reason).
    const { error: creditError } = await db.rpc("credit_customer_for_order", {
      p_customer_id: customer.id,
      p_amount: order.client_price,
      p_order_id: order.id,
      p_reason: "cancelled_before_ship",
    });
    if (creditError) {
      console.error("[card-actions] credit_customer_for_order failed:", creditError);
    }
    if (ctx.session.awaitingReceiptForOrderId === orderId) {
      ctx.session.awaitingReceiptForOrderId = undefined;
    }
    await ctx.reply(
      `❌ Заказ №${order.order_number} отменён.\n\n` +
        `Деньги вернулись на твой баланс — посмотри в профиле.`
    );
    return;
  }

  // is_paid=false: ждали чека или +ВАЙБ-долг. Размер — db-триггер на cancelled
  // освобождает product_sizes; reservations подхватываем dec'ом для не-+ВАЙБ.
  if (order.product_size_id) {
    const { error: decError } = await db.rpc("decrement_reserved_quantity", {
      size_id: order.product_size_id,
    });
    if (decError) {
      console.error("[card-actions] decrement_reserved_quantity failed:", decError);
    }
  }
  cancelExpireUnpaidOrder(orderId).catch((e) =>
    console.error("[card-actions] cancelExpireUnpaidOrder failed:", e)
  );
  if (ctx.session.awaitingReceiptForOrderId === orderId) {
    ctx.session.awaitingReceiptForOrderId = undefined;
  }
  if (order.partner_id) {
    sendToPartner({
      partnerId: order.partner_id,
      text: `🤝 Заказ №${order.order_number} отменён клиентом.`,
    }).catch((e) => console.error("[card-actions] sendToPartner failed:", e));
  }

  await ctx.reply(`❌ Заказ №${order.order_number} отменён.`);
}

// =====================================================================
// bad_barcode-fix: клиент сам обновляет трек, проблема снимается.
// При обновлении заказ возвращается в общий пул paid (claimed_by сбрасывается),
// чтобы любой свободный отправщик мог его взять.
// =====================================================================

export async function startFixTrack(
  ctx: CustomerContext,
  customer: Customer,
  orderId: string
): Promise<void> {
  const db = getBotDb();
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, status, problem_type, tracking_number")
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .single();

  if (!order || order.status !== "problem" || order.problem_type !== "bad_barcode") {
    await ctx.reply("Этот заказ нельзя обновить — он уже не в проблеме с треком.");
    return;
  }

  ctx.session.fixTrackOrderId = orderId;
  ctx.session.step = "awaiting_fix_track_input";

  const currentLine = order.tracking_number
    ? `\n\nСтарый трек: <code>${order.tracking_number}</code>`
    : "";
  await ctx.reply(
    `✏️ Заказ №${order.order_number} — пришли новый трек одним сообщением.${currentLine}`,
    { parse_mode: "HTML" }
  );
}

export async function handleFixTrackInput(
  ctx: CustomerContext,
  customer: Customer,
  text: string
): Promise<void> {
  const orderId = ctx.session.fixTrackOrderId;
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
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, status, problem_type, status_history, tracking_number")
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .single();

  if (!order || order.status !== "problem" || order.problem_type !== "bad_barcode") {
    ctx.session.fixTrackOrderId = undefined;
    ctx.session.step = undefined;
    await ctx.reply("Заказ уже не в статусе ожидания трека.");
    return;
  }

  if (tracking === order.tracking_number) {
    await ctx.reply("Это тот же трек. Пришли другой — иначе отправщик снова не отсканирует.");
    return;
  }

  const { error } = await db
    .from("orders")
    .update({
      tracking_number: tracking,
      status: "paid",
      problem_type: null,
      system_comment: null,
      claimed_by: null,
      claimed_at: null,
      status_history: appendStatusHistory(order.status_history, "paid", {
        from: "problem",
        reason: "track_fixed_by_customer",
      }),
    })
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .eq("status", "problem")
    .eq("problem_type", "bad_barcode");

  ctx.session.fixTrackOrderId = undefined;
  ctx.session.step = undefined;

  if (error) {
    console.error("[card-actions] fix-track update failed:", error);
    await ctx.reply("Не удалось обновить трек. Попробуй позже.");
    return;
  }

  await ctx.reply(`✅ Трек заказа №${order.order_number} обновлён — заказ снова в работе.`);
}

// =====================================================================
// Утилиты
// =====================================================================

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map((p) => parseInt(p, 10));
  const [ty, tm, td] = toIso.split("-").map((p) => parseInt(p, 10));
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}
