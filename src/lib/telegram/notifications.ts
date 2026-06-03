/**
 * Система уведомлений через Telegram — owner и shipper
 *
 * После пивота на B2B SaaS остались только owner и shipper-уведомления.
 * Customer-bot (для клиентов оптовика) появится в Этапе 3 пивота — отдельный модуль.
 */

import { Bot, InputFile } from "grammy";
import { getBotDb } from "./db";
import { formatPrice } from "./utils/formatters";
import { MOSCOW_TZ, moscowToday } from "@/lib/utils/moscow-time";

export type NotificationType =
  // Для отправщиков
  | "returns_ready"
  | "shipper_payout_ready"
  | "shipper_payout_paid"
  // Для владельца
  | "new_order"
  | "new_customer"
  | "receipt_received"
  | "order_problem"
  | "product_low_stock"
  | "order_not_shipped"
  | "daily_summary"
  | "security_alert";

export interface NotificationPayload {
  userId?: string;
  telegramId?: number;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

let shipperBotInstance: Bot | null = null;
let ownerBotInstance: Bot | null = null;
let aiPhotosBotInstance: Bot | null = null;
let customerBotInstance: Bot | null = null;

function getShipperBotForNotifications(): Bot {
  if (!shipperBotInstance) {
    const token = process.env.TELEGRAM_SHIPPER_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_SHIPPER_BOT_TOKEN is not set");
    shipperBotInstance = new Bot(token);
  }
  return shipperBotInstance;
}

function getOwnerBotForNotifications(): Bot {
  if (!ownerBotInstance) {
    const token = process.env.TELEGRAM_OWNER_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_OWNER_BOT_TOKEN is not set");
    ownerBotInstance = new Bot(token);
  }
  return ownerBotInstance;
}

// AI-фото объявлений шлёт ОТДЕЛЬНЫЙ бот (@krossovodaiphotosbot), не owner-bot.
// Кнопки «Четко/Переделай» обрабатывает он же (registerAiPhotoHandlers на aiphotos-bot).
function getAiPhotosBotForNotifications(): Bot {
  if (!aiPhotosBotInstance) {
    const token = process.env.TELEGRAM_AIPHOTOS_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_AIPHOTOS_BOT_TOKEN is not set");
    aiPhotosBotInstance = new Bot(token);
  }
  return aiPhotosBotInstance;
}

export function getCustomerBotForNotifications(): Bot {
  if (!customerBotInstance) {
    const token = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_CUSTOMER_BOT_TOKEN is not set");
    customerBotInstance = new Bot(token);
  }
  return customerBotInstance;
}

/**
 * Личный @username для прямой переписки клиента с человеком (директор/владелец).
 * Приоритет:
 *   1. business_settings.director_tg_username — username привязанного директора.
 *   2. settings.owner_telegram_username — username владельца.
 * Намеренно НЕ используем support_telegram_username (там мог оказаться username
 * бота-помощника). Возвращает строку «@handle» или null если никто не настроен.
 */
export async function getDirectorPersonalHandle(): Promise<string | null> {
  const db = getBotDb();
  const [bizRes, ownerRes] = await Promise.all([
    db.from("business_settings").select("director_tg_username").maybeSingle(),
    db.from("settings").select("owner_telegram_username").maybeSingle(),
  ]);
  const raw =
    (bizRes.data?.director_tg_username as string | null) ||
    (ownerRes.data?.owner_telegram_username as string | null) ||
    null;
  if (!raw) return null;
  return `@${raw.replace(/^@/, "")}`;
}

let partnerBotInstance: Bot | null = null;
function getPartnerBotForNotifications(): Bot {
  if (!partnerBotInstance) {
    const token = process.env.TELEGRAM_PARTNER_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_PARTNER_BOT_TOKEN is not set");
    partnerBotInstance = new Bot(token);
  }
  return partnerBotInstance;
}

let directorBotInstance: Bot | null = null;
function getDirectorBotForNotifications(): Bot {
  if (!directorBotInstance) {
    const token = process.env.TELEGRAM_DIRECTOR_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_DIRECTOR_BOT_TOKEN is not set");
    directorBotInstance = new Bot(token);
  }
  return directorBotInstance;
}

/**
 * Шлём сообщение партнёру через partner-bot. Если партнёр ещё не привязан
 * (tg_user_id IS NULL) — возвращаем false. Telegram запрещает писать
 * первым, поэтому партнёр должен сначала сделать /start <invite_token>.
 */
export async function sendToPartner(params: {
  partnerId: string;
  text: string;
  replyMarkup?: unknown;
  parseMode?: "HTML" | "Markdown";
}): Promise<boolean> {
  const db = getBotDb();
  const { data: partner } = await db
    .from("partners")
    .select("tg_user_id, is_active")
    .eq("id", params.partnerId)
    .maybeSingle();

  if (!partner || !partner.tg_user_id || !partner.is_active) {
    console.warn("sendToPartner: partner not linked / inactive", params.partnerId);
    return false;
  }

  try {
    const bot = getPartnerBotForNotifications();
    await bot.api.sendMessage(partner.tg_user_id, params.text, {
      parse_mode: params.parseMode ?? "HTML",
      // grammy типизирует reply_markup строго, но мы принимаем любой объект.
      reply_markup: params.replyMarkup as never,
    });
    return true;
  } catch (error) {
    console.error("sendToPartner failed:", error);
    return false;
  }
}

/**
 * Отправить фото чека партнёру с inline-кнопками «✅ Получил» / «❌ Нет в наличии».
 * Используется после того, как клиент прислал чек по партнёрскому заказу.
 */
export async function sendReceiptPhotoToPartner(params: {
  partnerId: string;
  orderId: string;
  orderNumber: number;
  amount: number;
  photoFileId?: string | null;
  photoBuffer?: Buffer | null;
  photoFilename?: string;
  productName?: string | null;
  size?: string | null;
  deliveryService?: string | null;
  trackingNumber?: string | null;
  customerUsername?: string | null;
}): Promise<boolean> {
  const db = getBotDb();
  const { data: partner } = await db
    .from("partners")
    .select("tg_user_id, is_active")
    .eq("id", params.partnerId)
    .maybeSingle();

  if (!partner || !partner.tg_user_id || !partner.is_active) return false;

  const lines: string[] = [`🧾 <b>Чек по заказу №${params.orderNumber}</b>`];
  if (params.productName) lines.push(`Товар: <b>${escapeHtmlLocal(params.productName)}</b>`);
  if (params.size) lines.push(`Размер: ${escapeHtmlLocal(params.size)}`);
  lines.push(`Сумма: <b>${formatPrice(params.amount)}</b>`);
  if (params.deliveryService) {
    const trackPart = params.trackingNumber
      ? ` · Трек: <code>${escapeHtmlLocal(params.trackingNumber)}</code>`
      : "";
    lines.push(`📦 Доставка: ${escapeHtmlLocal(params.deliveryService)}${trackPart}`);
  }
  if (params.customerUsername) lines.push(`Клиент: @${escapeHtmlLocal(params.customerUsername)}`);
  lines.push("");
  lines.push(
    `Получил деньги? Напиши <b>«${params.orderNumber} да»</b> или <b>«${params.orderNumber} нет»</b>.`
  );

  // Текстовый ответ «<N> да/нет» — намеренно: защищает от случайного мисклика
  // (партнёр печатает явный номер) и снимает нагрузку с висячих inline-клавиатур
  // на каждом неподтверждённом заказе. Кнопки появляются только на втором
  // шаге — для выбора причины после «<N> нет» (см. partner-bot handlers).

  try {
    const bot = getPartnerBotForNotifications();
    if (params.photoBuffer) {
      const { InputFile } = await import("grammy");
      await bot.api.sendPhoto(
        partner.tg_user_id,
        new InputFile(params.photoBuffer, params.photoFilename ?? "receipt.png"),
        { caption: lines.join("\n"), parse_mode: "HTML" }
      );
    } else if (params.photoFileId) {
      await bot.api.sendPhoto(partner.tg_user_id, params.photoFileId, {
        caption: lines.join("\n"),
        parse_mode: "HTML",
      });
    } else {
      console.error("sendReceiptPhotoToPartner: no photo source");
      return false;
    }
    return true;
  } catch (error) {
    console.error("sendReceiptPhotoToPartner failed:", error);
    return false;
  }
}

/**
 * +ВАЙБ-долговый запрос партнёру: «можешь отправить?» — без чека, без TTL.
 * Партнёр отвечает «N да/нет» — на «N да» pending → orders.is_paid=false,
 * клиент потом гасит долг через «💳 Оплатить долг».
 */
export async function sendVibeDebtRequestToPartner(params: {
  partnerId: string;
  pendingId: string;
  orderNumber: number;
  clientPrice: number;
  productName?: string | null;
  size?: string | null;
  deliveryService?: string | null;
  trackingNumber?: string | null;
  customerUsername?: string | null;
}): Promise<boolean> {
  void params.pendingId;
  const db = getBotDb();
  const { data: partner } = await db
    .from("partners")
    .select("tg_user_id, is_active")
    .eq("id", params.partnerId)
    .maybeSingle();

  if (!partner || !partner.tg_user_id || !partner.is_active) return false;

  const lines: string[] = [`🛍 <b>Заказ в долг №${params.orderNumber}</b>`];
  if (params.productName) lines.push(`Товар: <b>${escapeHtmlLocal(params.productName)}</b>`);
  if (params.size) lines.push(`Размер: ${escapeHtmlLocal(params.size)}`);
  lines.push(`Сумма (для информации): <b>${formatPrice(params.clientPrice)}</b>`);
  if (params.deliveryService) {
    const trackPart = params.trackingNumber
      ? ` · Трек: <code>${escapeHtmlLocal(params.trackingNumber)}</code>`
      : "";
    lines.push(`📦 Доставка: ${escapeHtmlLocal(params.deliveryService)}${trackPart}`);
  }
  if (params.customerUsername) lines.push(`Клиент: @${escapeHtmlLocal(params.customerUsername)}`);
  lines.push("");
  lines.push(
    `Можешь отправить? Ответь <b>«${params.orderNumber} да»</b> или <b>«${params.orderNumber} нет»</b>.\nДеньги придут позже через систему «оплатить долг».`
  );

  try {
    const bot = getPartnerBotForNotifications();
    await bot.api.sendMessage(partner.tg_user_id, lines.join("\n"), { parse_mode: "HTML" });
    return true;
  } catch (error) {
    console.error("sendVibeDebtRequestToPartner failed:", error);
    return false;
  }
}

/**
 * Отправить клиенту (customer) сообщение через customer-bot
 * и записать его в order_messages (kind='status_update').
 */
async function sendToCustomer(params: {
  customerId: string;
  orderId?: string | null;
  text: string;
  kind?: "status_update" | "receipt" | "note";
  replyMarkup?: { inline_keyboard: { text: string; callback_data: string }[][] };
}): Promise<boolean> {
  const db = getBotDb();
  const { data: customer } = await db
    .from("customers")
    .select("tg_user_id")
    .eq("id", params.customerId)
    .single();

  if (!customer || !customer.tg_user_id) {
    console.warn("sendToCustomer: customer not found or no tg_user_id", params.customerId);
    return false;
  }

  try {
    const bot = getCustomerBotForNotifications();
    await bot.api.sendMessage(customer.tg_user_id, params.text, {
      parse_mode: "HTML",
      ...(params.replyMarkup ? { reply_markup: params.replyMarkup } : {}),
    });

    if (params.orderId) {
      await db.from("order_messages").insert({
        order_id: params.orderId,
        tg_chat_id: customer.tg_user_id,
        tg_message_id: 0,
        kind: params.kind ?? "status_update",
        direction: "outbound",
        body: params.text,
      });
    }
    return true;
  } catch (error) {
    // Telegram может вернуть "Forbidden: bot was blocked by the user".
    console.error("sendToCustomer failed:", error);
    return false;
  }
}

const SHIPPER_TYPES: NotificationType[] = [
  "returns_ready",
  "shipper_payout_ready",
  "shipper_payout_paid",
];

function getBotForNotificationType(type: NotificationType): Bot {
  if (SHIPPER_TYPES.includes(type)) {
    return getShipperBotForNotifications();
  }
  return getOwnerBotForNotifications();
}

/**
 * Основная функция отправки уведомления.
 */
export async function sendNotification(payload: NotificationPayload): Promise<boolean> {
  const db = getBotDb();

  try {
    let telegramId = payload.telegramId;

    if (!telegramId && payload.userId) {
      const { data: user } = await db
        .from("users")
        .select("telegram_id, role")
        .eq("id", payload.userId)
        .single();

      if (!user) {
        console.error("User not found for notification:", payload.userId);
        return false;
      }

      telegramId = user.telegram_id;
    }

    if (!telegramId) {
      console.error("No telegram_id for notification");
      return false;
    }

    if (payload.userId) {
      const notificationData = payload.data
        ? (JSON.parse(JSON.stringify(payload.data)) as {
            [key: string]: string | number | boolean | null;
          })
        : undefined;

      await db.from("notifications").insert({
        user_id: payload.userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        data: notificationData,
        sent_to_telegram: true,
        sent_at: new Date().toISOString(),
      });
    }

    const bot = getBotForNotificationType(payload.type);

    await bot.api.sendMessage(telegramId, payload.message, {
      parse_mode: "HTML",
    });

    return true;
  } catch (error) {
    console.error("Error sending notification:", error);
    return false;
  }
}

// ============================================
// Уведомления отправщикам
// ============================================

/**
 * Алерт «срочный новый заказ — отправить сегодня».
 *
 * Вызывается из всех мест, где `status` переходит в `paid`:
 *  - confirm-payment (классический Vision-flow)
 *  - shipper/orders/create (отправщик сам создаёт заказ через PWA)
 *  - partner-bot подтверждение получения оплаты от клиента
 *
 * Skip-условия (idempotent, без ошибок):
 *  - urgent_alert_sent_at != NULL — уже слали
 *  - status != 'paid' — не релевантно
 *  - source_warehouse != 'owner' — не виден отправщикам владельца
 *  - send_by != сегодня МСК — не срочный
 *
 * Шлёт DM каждому shipper'у с привязанным telegram_id, потом маркирует
 * orders.urgent_alert_sent_at чтобы повторный вызов был no-op.
 */
export async function notifyShippersOrderUrgent(orderId: string): Promise<boolean> {
  const db = getBotDb();

  const { data: order } = await db
    .from("orders")
    .select(
      `id, order_number, size, status, send_by, source_warehouse,
       urgent_alert_sent_at, pickup_point_label_snapshot, pickup_point_address_snapshot,
       product:products(name)`
    )
    .eq("id", orderId)
    .single();

  if (!order) return false;
  if (order.urgent_alert_sent_at) return false;
  if (order.status !== "paid") return false;
  if (order.source_warehouse !== "owner") return false;
  if (!order.send_by) return false;
  if (order.send_by !== moscowToday()) return false;

  const productName =
    (Array.isArray(order.product) ? order.product[0]?.name : order.product?.name) ?? "—";
  const pickupLabel = (order.pickup_point_label_snapshot as string | null) ?? "";
  const pickupAddress = (order.pickup_point_address_snapshot as string | null) ?? "";
  const pickupLine =
    pickupLabel && pickupAddress
      ? `${pickupLabel} — ${pickupAddress}`
      : pickupLabel || pickupAddress;

  const text =
    `⚠️ Срочный заказ №${order.order_number} — отправить сегодня\n\n` +
    `${productName}${order.size ? `, размер ${order.size}` : ""}\n` +
    (pickupLine ? `ПВЗ: ${pickupLine}\n\n` : "\n") +
    `Дедлайн: сегодня до полуночи МСК.`;

  const { data: shippers } = await db
    .from("users")
    .select("id, telegram_id")
    .eq("role", "shipper")
    .eq("is_blocked", false)
    .gt("telegram_id", 0);

  if (shippers && shippers.length > 0) {
    const bot = getShipperBotForNotifications();
    for (const sh of shippers) {
      const tgId = sh.telegram_id as number | null;
      if (!tgId) continue;
      try {
        await bot.api.sendMessage(tgId, text);
      } catch (err) {
        console.error(`notifyShippersOrderUrgent: DM failed for shipper ${sh.id}:`, err);
      }
    }
  }

  await db
    .from("orders")
    .update({ urgent_alert_sent_at: new Date().toISOString() })
    .eq("id", orderId);

  return true;
}

// notifyShipperPayoutReady удалён 2026-05-18 вместе с ledger-моделью §9.6:
// «выплата сформирована, ждёт перевода» — состояние period-payout, которого
// в 2-режимной модели нет (владелец просто переводит и фиксирует факт).

/**
 * Уведомить отправщика, что выплата переведена (владелец зафиксировал
 * факт выплаты в shipper_payouts — канон §9.6, 2-режимная модель).
 */
export async function notifyShipperPayoutPaid(params: {
  shipperId: string;
  amount: number;
}): Promise<boolean> {
  try {
    const db = getBotDb();
    const { data } = await db
      .from("users")
      .select("telegram_id")
      .eq("id", params.shipperId)
      .gt("telegram_id", 0)
      .single();
    if (!data?.telegram_id) return false;
    const bot = getShipperBotForNotifications();
    await bot.api.sendMessage(
      data.telegram_id,
      `✅ Выплата переведена!\n\n` +
        `Сумма: <b>${formatPrice(params.amount)}</b>\n` +
        `Деньги отправлены на твой счёт.`,
      { parse_mode: "HTML" }
    );
    return true;
  } catch (error) {
    console.error("notifyShipperPayoutPaid failed:", error);
    return false;
  }
}

/**
 * Уведомить отправщика, что заказ автоматически возобновлён из problem.
 * Триггерится из job `auto-resume-problem` когда товар появился (возврат
 * принят на ПВЗ, owner пополнил остаток вручную и т.п.).
 */
export async function notifyShipperOrderResumed(params: {
  shipperId: string;
  orderNumber: number;
  hint: string;
}): Promise<boolean> {
  try {
    const db = getBotDb();
    const { data } = await db
      .from("users")
      .select("telegram_id")
      .eq("id", params.shipperId)
      .gt("telegram_id", 0)
      .single();
    if (!data?.telegram_id) return false;
    const bot = getShipperBotForNotifications();
    await bot.api.sendMessage(
      data.telegram_id,
      `🟢 Заказ №${params.orderNumber} снова в работе.\n\n` + params.hint,
      { parse_mode: "HTML" }
    );
    return true;
  } catch (error) {
    console.error("notifyShipperOrderResumed failed:", error);
    return false;
  }
}

// ============================================
// Уведомления владельцу
// ============================================

// Читаем OWNER_TELEGRAM_ID лениво — на момент вызова, а не на импорте модуля
// (TS hoisting импортов запускает этот файл до dotenv.config() в worker'е/боте).
function getOwnerTelegramId(): number {
  return parseInt(process.env.OWNER_TELEGRAM_ID || "0");
}

function escapeHtmlLocal(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ============================================
// Гибкий роутинг уведомлений: владелец vs директор
// ============================================

/** Ключи типов уведомлений, маршрутизируемых владельцу/директору. */
export type NotificationRouteKey =
  | "receipt_review"
  | "order_problem"
  | "partner_silent_24h"
  | "partner_debt_received"
  | "withdrawal_request"
  | "daily_summary"
  | "security_alert"
  | "customer_contact";

export const NOTIFICATION_ROUTE_LABELS: Record<NotificationRouteKey, string> = {
  receipt_review: "Чек на проверку (Vision не подтвердил)",
  order_problem: "Расхождение склада",
  partner_silent_24h: "Партнёр молчит 24 часа",
  partner_debt_received: "Партнёр погасил долг по комиссиям",
  withdrawal_request: "Запрос клиента на вывод",
  daily_summary: "Дневная сводка",
  security_alert: "Алерты безопасности",
  customer_contact: "«Написать владельцу» в карточке заказа клиента",
};

export const NOTIFICATION_ROUTE_DEFAULTS: Record<NotificationRouteKey, "owner" | "director"> = {
  receipt_review: "director",
  order_problem: "director",
  partner_silent_24h: "director",
  partner_debt_received: "owner",
  withdrawal_request: "owner",
  daily_summary: "owner",
  security_alert: "owner",
  customer_contact: "director",
};

/**
 * Резолвит куда слать уведомление по `routeKey`. Читает business_settings.notification_routes
 * (owner/director). Если выбран director, но он не привязан или TELEGRAM_DIRECTOR_BOT_TOKEN не
 * задан — fallback на владельца. Возвращает null если ни одного таргета нет.
 */
async function resolveRouteTarget(routeKey: NotificationRouteKey): Promise<{
  bot: Bot;
  telegramId: number;
  isDirector: boolean;
  fellBack: boolean;
} | null> {
  const db = getBotDb();
  const { data: settings } = await db
    .from("business_settings")
    .select("notification_routes, director_tg_user_id")
    .limit(1)
    .maybeSingle();

  const routes = (settings?.notification_routes ?? {}) as Record<string, string>;
  const desired =
    (routes[routeKey] as "owner" | "director" | undefined) ?? NOTIFICATION_ROUTE_DEFAULTS[routeKey];

  const directorToken = process.env.TELEGRAM_DIRECTOR_BOT_TOKEN;
  const directorId = (settings?.director_tg_user_id as number | null) ?? null;

  if (desired === "director" && directorToken && directorId) {
    return {
      bot: new Bot(directorToken),
      telegramId: directorId,
      isDirector: true,
      fellBack: false,
    };
  }

  const ownerId = getOwnerTelegramId();
  if (!ownerId) return null;
  return {
    bot: getOwnerBotForNotifications(),
    telegramId: ownerId,
    isDirector: false,
    fellBack: desired === "director", // хотели директора, но не получилось
  };
}

/**
 * Текстовое уведомление по гибкому роуту. Если таргет — fallback (хотели директора,
 * но он не привязан) — добавляется хвост-подсказка про настройки.
 */
export async function sendByRoute(params: {
  routeKey: NotificationRouteKey;
  message: string;
}): Promise<boolean> {
  const target = await resolveRouteTarget(params.routeKey);
  if (!target) {
    console.warn(`[sendByRoute] no target for ${params.routeKey} (OWNER_TELEGRAM_ID missing?)`);
    return false;
  }

  const finalMessage = target.fellBack
    ? `${params.message}\n\n<i>⚠️ Директор не привязан — пришло сюда. Привяжи в /owner/settings.</i>`
    : params.message;

  try {
    await target.bot.api.sendMessage(target.telegramId, finalMessage, { parse_mode: "HTML" });
    return true;
  } catch (error) {
    console.error(`[sendByRoute] ${params.routeKey} failed:`, error);
    return false;
  }
}

/**
 * Эскалация (молчание партнёра 24ч) — публичный API для handlers.
 */
export async function sendDirectorEscalation(params: {
  title: string;
  message: string;
}): Promise<boolean> {
  return sendByRoute({ routeKey: "partner_silent_24h", message: params.message });
}

/**
 * Эскалация владельцу — для случаев когда автоматика и директор не справились
 * (например, директор не ответил 24ч на чек). Шлём прямо в owner-bot, минуя
 * routing: владелец это последняя инстанция, его всегда уведомляем напрямую.
 */
export async function sendOwnerEscalation(params: {
  title: string;
  message: string;
}): Promise<boolean> {
  const ownerId = process.env.OWNER_TELEGRAM_ID ? Number(process.env.OWNER_TELEGRAM_ID) : null;
  if (!ownerId || Number.isNaN(ownerId)) {
    console.warn("[sendOwnerEscalation] OWNER_TELEGRAM_ID not set");
    return false;
  }
  try {
    const bot = getOwnerBotForNotifications();
    await bot.api.sendMessage(ownerId, params.message, { parse_mode: "HTML" });
    return true;
  } catch (e) {
    console.error("[sendOwnerEscalation] failed:", e);
    return false;
  }
}

/**
 * Сбой AI-генерации фото («AI не вернул изображение» и т.п.) — шлём ПОЛУЧАТЕЛЮ обложек
 * товара (chatId = products.cover_tg_chat_id), а не глобальному OWNER_TELEGRAM_ID.
 * Чтобы провал ИМЕННО этого товара видел тот, кто заказал генерацию (тот же чат, куда
 * приходят сами фото на «Четко/Переделай»). Канон §2.7: нет получателя → НЕ шлём,
 * никакого дефолта на OWNER_TELEGRAM_ID.
 */
export async function notifyAiPhotoFailure(params: {
  chatId?: number | null;
  message: string;
}): Promise<boolean> {
  if (!params.chatId) {
    console.warn("[notifyAiPhotoFailure] нет chatId получателя — не уведомляем (без дефолта на owner)");
    return false;
  }
  try {
    const bot = getAiPhotosBotForNotifications();
    await bot.api.sendMessage(params.chatId, params.message, { parse_mode: "HTML" });
    return true;
  } catch (e) {
    console.error("[notifyAiPhotoFailure] failed:", e);
    return false;
  }
}

/**
 * Запрос клиента на вывод. Шлётся по routeKey `withdrawal_request`.
 * Без inline-кнопок — владелец отвечает текстом «N да» (закрыть запрос —
 * деньги переведены клиенту вне бота) или «N нет» (отказать в выводе,
 * вернуть деньги клиенту на баланс). Аналогично паттерну партнёрских чеков —
 * защита от случайного нажатия на финансовую операцию.
 *
 * Парсер «N да/нет» — в owner-bot.
 */
export async function notifyWithdrawalRequest(params: {
  withdrawalNumber: number;
  amount: number;
  customerLabel: string;
}): Promise<boolean> {
  const target = await resolveRouteTarget("withdrawal_request");
  if (!target) {
    console.warn("[notifyWithdrawalRequest] no target");
    return false;
  }

  const n = params.withdrawalNumber;
  const baseMessage =
    `💸 <b>Запрос на вывод №${n}</b>\n\n` +
    `Клиент: ${escapeHtmlLocal(params.customerLabel)}\n` +
    `Сумма: <b>${formatPrice(params.amount)}</b>\n\n` +
    `Когда переведёшь деньги — напиши «${n} да» (закрыть запрос).\n` +
    `Если хочешь вернуть деньги клиенту на баланс — «${n} нет».`;

  const message = target.fellBack
    ? `${baseMessage}\n\n<i>⚠️ Директор не привязан — пришло сюда. Привяжи в /owner/settings.</i>`
    : baseMessage;

  try {
    await target.bot.api.sendMessage(target.telegramId, message, { parse_mode: "HTML" });
    return true;
  } catch (error) {
    console.error("[notifyWithdrawalRequest] failed:", error);
    return false;
  }
}

/**
 * Клиент отменил свой pending-запрос на вывод. Информационный DM по тому же
 * routing-ключу `withdrawal_request`. Баланс уже возвращён клиенту в RPC
 * `cancel_withdrawal_atomic`, действий от владельца не требуется.
 */
export async function notifyWithdrawalCancelled(params: {
  withdrawalNumber: number;
  amount: number;
  customerLabel: string;
}): Promise<boolean> {
  const target = await resolveRouteTarget("withdrawal_request");
  if (!target) return false;

  const message =
    `↩️ <b>Запрос на вывод №${params.withdrawalNumber} отменён клиентом</b>\n\n` +
    `Клиент: ${escapeHtmlLocal(params.customerLabel)}\n` +
    `Сумма: <b>${formatPrice(params.amount)}</b>\n\n` +
    `Клиент сам отменил запрос — деньги вернулись на его баланс. Действий от тебя не требуется.`;

  try {
    await target.bot.api.sendMessage(target.telegramId, message, { parse_mode: "HTML" });
    return true;
  } catch (error) {
    console.error("[notifyWithdrawalCancelled] failed:", error);
    return false;
  }
}

/**
 * Партнёр погасил долг по комиссиям — фото чека + кнопка «Подтвердить».
 * Кнопка `partner:debt:confirm:<partnerId>` обрабатывается в owner-bot
 * (как и withdrawal — финансовая операция). Если route=director → director
 * увидит, но подтверждение делает владелец.
 */
export async function notifyPartnerDebtReceipt(params: {
  partnerId: string;
  partnerName: string;
  debtAmount: number;
  ordersCount: number;
  receiptFileId: string;
}): Promise<boolean> {
  const target = await resolveRouteTarget("partner_debt_received");
  if (!target) return false;

  const baseCaption =
    `🤝 Партнёр «${params.partnerName}» оплатил долг по комиссиям\n\n` +
    `Сумма: ${formatPrice(params.debtAmount)}\n` +
    `Заказов: ${params.ordersCount}\n\n` +
    `После проверки нажми кнопку ниже — комиссии будут помечены как полученные.`;

  const caption = target.fellBack
    ? `${baseCaption}\n\n<i>⚠️ Директор не привязан — пришло сюда. Привяжи в /owner/settings.</i>`
    : baseCaption;

  try {
    await target.bot.api.sendPhoto(target.telegramId, params.receiptFileId, {
      caption,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Подтвердить погашение",
              callback_data: `partner:debt:confirm:${params.partnerId}`,
            },
          ],
        ],
      },
    });
    return true;
  } catch (error) {
    console.error("[notifyPartnerDebtReceipt] failed:", error);
    return false;
  }
}

/**
 * Клиент прислал фото чека за заказ — директору нужно подтвердить или отклонить.
 * Владелец не контактирует с клиентами — это операционная задача директора.
 */
export async function notifyOwnerReceiptReceived(params: {
  orderNumber: number;
  clientPrice: number;
  customerName: string | null;
  customerUsername: string | null;
}) {
  const customerLine = params.customerUsername
    ? `@${escapeHtmlLocal(params.customerUsername)}`
    : params.customerName
      ? escapeHtmlLocal(params.customerName)
      : "—";

  return sendByRoute({
    routeKey: "receipt_review",
    message:
      `🧾 Чек по заказу №${params.orderNumber}\n` +
      `Клиент: ${customerLine}\n` +
      `Сумма: <b>${formatPrice(params.clientPrice)}</b>`,
  });
}

/**
 * Vision не смог auto-confirm чек — шлём ДИРЕКТОРУ в director-bot фото чека.
 * Директор подтверждает текстом «<order_number> да» / «<order_number> нет»
 * (см. director-bot.ts).
 *
 * Fallback: если директор не привязан — fallback на владельца через owner-bot.
 * Используется только для не-партнёрских pending'ов (партнёрские подтверждает партнёр).
 */
export async function notifyDirectorPendingReceiptForReview(params: {
  pendingOrderId: string;
  orderNumber: number;
  clientPrice: number;
  customerName: string | null;
  customerUsername: string | null;
  receiptBuffer: Buffer;
  visionAmount: number | null;
  visionRecipientName?: string | null;
  visionRecipientBank?: string | null;
  checksDetails?: string;
  hint?: string;
}): Promise<boolean> {
  const customerLine = params.customerUsername
    ? `@${escapeHtmlLocal(params.customerUsername)}`
    : params.customerName
      ? escapeHtmlLocal(params.customerName)
      : "—";

  const lines: string[] = [
    `🧾 <b>Чек на проверку — заказ №${params.orderNumber}</b>`,
    `Клиент: ${customerLine}`,
    `Ожидалось: <b>${formatPrice(params.clientPrice)}</b>`,
  ];

  if (params.visionAmount != null) {
    lines.push(`Vision сумма: <b>${formatPrice(params.visionAmount)}</b>`);
  } else {
    lines.push(`Vision сумму не разобрал.`);
  }
  if (params.visionRecipientName) {
    lines.push(`Получатель в чеке: ${escapeHtmlLocal(params.visionRecipientName)}`);
  }
  if (params.visionRecipientBank) {
    lines.push(`Банк в чеке: ${escapeHtmlLocal(params.visionRecipientBank)}`);
  }

  if (params.checksDetails) {
    lines.push("");
    lines.push("<b>Проверки:</b>");
    lines.push(escapeHtmlLocal(params.checksDetails));
  }

  if (params.hint) {
    lines.push("");
    lines.push(`⚠️ ${escapeHtmlLocal(params.hint)}`);
  }

  lines.push("");
  lines.push(
    `Получил деньги? Напиши <b>«${params.orderNumber} да»</b> или <b>«${params.orderNumber} нет»</b>.`
  );

  const caption = lines.join("\n");

  // Резолвим адресата по routing-настройке `receipt_review`.
  const target = await resolveRouteTarget("receipt_review");
  if (!target) {
    console.warn("[notifyDirectorPendingReceiptForReview] no target");
    return false;
  }

  const finalCaption = target.fellBack
    ? `${caption}\n\n<i>⚠️ Директор не привязан — пришло сюда. Привяжи в /owner/settings.</i>`
    : caption;

  try {
    await target.bot.api.sendPhoto(
      target.telegramId,
      new InputFile(params.receiptBuffer, "receipt.jpg"),
      { caption: finalCaption, parse_mode: "HTML" }
    );
    return true;
  } catch (error) {
    console.error("[notifyDirectorPendingReceiptForReview] failed:", error);
    return false;
  }
}

/**
 * Replay-подозрение: клиент 2-й раз прислал чек с тем же operation_id,
 * который уже подтверждён по другому заказу. Шлём директору два чека
 * для глазного сравнения + ясную шапку и инструкцию.
 */
export async function notifyDirectorReplaySuspicion(params: {
  pendingOrderId: string;
  newOrderNumber: number;
  newClientPrice: number;
  customerName: string | null;
  customerUsername: string | null;
  newReceiptBuffer: Buffer;
  originalOrderNumber: number;
  originalPaidAt: string | null;
  originalClientPrice: number | null;
  originalReceiptBuffer: Buffer | null;
  operationId: string | null;
}): Promise<boolean> {
  const customerLine = params.customerUsername
    ? `@${escapeHtmlLocal(params.customerUsername)}`
    : params.customerName
      ? escapeHtmlLocal(params.customerName)
      : "—";

  const originalDateLine = params.originalPaidAt
    ? new Date(params.originalPaidAt).toLocaleString("ru-RU", {
        timeZone: MOSCOW_TZ,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const headerLines: string[] = [
    `🚨 <b>Подозрение на повторный чек</b>`,
    ``,
    `Текущий заказ: <b>№${params.newOrderNumber}</b> на ${formatPrice(params.newClientPrice)}`,
    `Клиент: ${customerLine}`,
    ``,
    `Уже использован: <b>заказ №${params.originalOrderNumber}</b>` +
      (params.originalClientPrice != null ? ` на ${formatPrice(params.originalClientPrice)}` : "") +
      ` (оплачен ${originalDateLine})`,
    `operation_id${params.operationId ? ` <code>${escapeHtmlLocal(params.operationId)}</code>` : ""} совпадает.`,
  ];

  const target = await resolveRouteTarget("receipt_review");
  if (!target) {
    console.warn("[notifyDirectorReplaySuspicion] no target");
    return false;
  }

  const headerText =
    headerLines.join("\n") +
    (target.fellBack
      ? `\n\n<i>⚠️ Директор не привязан — пришло сюда. Привяжи в /owner/settings.</i>`
      : "");

  try {
    await target.bot.api.sendMessage(target.telegramId, headerText, { parse_mode: "HTML" });

    await target.bot.api.sendPhoto(
      target.telegramId,
      new InputFile(params.newReceiptBuffer, "new_receipt.jpg"),
      { caption: `📥 Новый чек — заказ №${params.newOrderNumber}` }
    );

    if (params.originalReceiptBuffer) {
      await target.bot.api.sendPhoto(
        target.telegramId,
        new InputFile(params.originalReceiptBuffer, "original_receipt.jpg"),
        { caption: `📤 Оригинал — заказ №${params.originalOrderNumber}` }
      );
    } else {
      await target.bot.api.sendMessage(
        target.telegramId,
        `⚠️ Оригинальный чек по заказу №${params.originalOrderNumber} в архиве не найден ` +
          `(старая запись без storage_path).`
      );
    }

    const tail =
      `Сравни глазами:\n` +
      `• Чеки одинаковые → клиент прислал тот же. Пиши «${params.newOrderNumber} нет» ` +
      `и жми «💸 Деньги не пришли».\n` +
      `• Чеки разные → Vision ошибся с operation_id, новый чек настоящий. ` +
      `Пиши «${params.newOrderNumber} да».`;
    await target.bot.api.sendMessage(target.telegramId, tail);

    return true;
  } catch (error) {
    console.error("[notifyDirectorReplaySuspicion] failed:", error);
    return false;
  }
}

// Уведомления о новых заказах удалены — заказы видны в группе клиентов
// (топик «Заказы»), отдельный DM ни владельцу ни директору не нужен.

export async function notifyOwnerDailySummary(params: {
  date: string;
  orders: number;
  revenue: number;
  profit: number;
  newClients: number;
  urgentOrders: number;
  lowStockProducts: Array<{ name: string; remaining: number }>;
}) {
  let message =
    `📊 Вечерняя сводка (${params.date}):\n\n` +
    `Заказов: ${params.orders}\n` +
    `Выручка: ${formatPrice(params.revenue)}\n` +
    `Прибыль: ${formatPrice(params.profit)}\n` +
    `Новых клиентов: ${params.newClients}\n`;

  const warnings: string[] = [];
  if (params.urgentOrders > 0) {
    warnings.push(`• ${params.urgentOrders} заказа(ов) сгорают завтра`);
  }
  params.lowStockProducts.forEach((product) => {
    warnings.push(`• ${product.name}: осталось ${product.remaining} шт.`);
  });
  if (warnings.length > 0) {
    message += `\n⚠️ Требует внимания:\n${warnings.join("\n")}`;
  }

  return sendByRoute({ routeKey: "daily_summary", message });
}

/**
 * DM владельцу при `out_of_stock` — расхождение склада с метриками
 * (BUSINESS_LOGIC §11.4). Запрашивает контекст через RPC
 * `get_stock_mismatch_context` (товар, размер, текущий остаток, заказы в
 * problem, возвраты в пути / на ПВЗ, ближайшая дата прибытия).
 *
 * `bad_barcode` сюда НЕ приходит (это диалог отправщик ↔ клиент про трек,
 * см. shipper-actions.executeMarkProblem).
 */
export async function notifyOwnerStockMismatch(params: {
  orderNumber: number;
  productSizeId: string;
  productId: string;
}) {
  const db = getBotDb();

  const { data: ctx, error } = await db.rpc("get_stock_mismatch_context", {
    p_product_size_id: params.productSizeId,
  });

  if (error) {
    console.error("[notifyOwnerStockMismatch] RPC error:", error);
    return sendByRoute({
      routeKey: "order_problem",
      message: `⚠️ Расхождение склада по заказу №${params.orderNumber}: отправщик не нашёл товар.`,
    });
  }

  const c = (ctx ?? {}) as {
    product_name?: string | null;
    size?: string | null;
    current_quantity?: number | null;
    problem_count?: number | null;
    in_transit_count?: number | null;
    on_pvz_count?: number | null;
    nearest_expected_return?: string | null;
  };

  const lines: string[] = [];
  lines.push(`⚠️ <b>Расхождение склада</b>`);
  if (c.product_name) {
    lines.push(`${c.product_name}${c.size ? ` · размер ${c.size}` : ""}`);
  }
  lines.push("");
  lines.push(`По базе должно быть: <b>${c.current_quantity ?? 0}</b> шт.`);
  lines.push(`Отправщик не нашёл при сборке заказа №${params.orderNumber}.`);

  const inTransit = c.in_transit_count ?? 0;
  const onPvz = c.on_pvz_count ?? 0;
  if (inTransit > 0 || onPvz > 0) {
    lines.push("");
    lines.push("<b>Возвраты на этот размер:</b>");
    if (inTransit > 0) {
      const nearest = c.nearest_expected_return
        ? new Date(c.nearest_expected_return).toLocaleDateString("ru-RU")
        : null;
      lines.push(`• ${inTransit} в пути${nearest ? ` (ближайший — ${nearest})` : ""}`);
    }
    if (onPvz > 0) {
      lines.push(`• ${onPvz} уже на ПВЗ`);
    }
  } else {
    lines.push("");
    lines.push("Возвратов на этот размер нет — заказ дождётся `send_by` и сгорит.");
  }

  const problemCount = c.problem_count ?? 0;
  if (problemCount > 1) {
    lines.push("");
    lines.push(`Сейчас в проблеме: <b>${problemCount}</b> заказа(ов).`);
  }

  lines.push("");
  lines.push(`→ /owner/products/${params.productId}`);

  return sendByRoute({
    routeKey: "order_problem",
    message: lines.join("\n"),
  });
}

export async function notifyOwnerSecurityAlert(params: {
  alertType: string;
  severity: string;
  username?: string;
}) {
  const alertLabels: Record<string, string> = {
    duplicate_fingerprint: "Дубликат устройства",
    rapid_orders: "Массовые заказы",
    return_abuse: "Злоупотр. возвратами",
    suspicious_cancellation: "Подозрит. отмены",
  };

  const sevLabels: Record<string, string> = {
    critical: "🔴 Критический",
    high: "🟠 Высокий",
  };

  return sendByRoute({
    routeKey: "security_alert",
    message:
      `🚨 <b>Алерт безопасности</b>\n\n` +
      `Тип: ${alertLabels[params.alertType] || params.alertType}\n` +
      `Уровень: ${sevLabels[params.severity] || params.severity}` +
      (params.username ? `\nКлиент: @${params.username}` : "") +
      `\n\n→ /owner/security`,
  });
}

// ============================================
// Уведомления клиентам (customer-bot, Stage 3)
// ============================================

/**
 * Оплата заказа подтверждена владельцем — заказ идёт в сборку.
 */
export async function notifyCustomerOrderApproved(params: {
  customerId: string;
  orderId: string;
  orderNumber: number;
  isVibeDebt?: boolean;
}) {
  const text = params.isVibeDebt
    ? `🤝 Партнёр подтвердил наличие — заказ №${params.orderNumber} принят в долг.\n\n` +
      `Собираем — пришлём уведомление, как только отправим.`
    : `✅ Оплата принята!\n\n` +
      `Заказ №${params.orderNumber} передан в сборку.\n` +
      `Пришлём уведомление, как только отправим.`;
  return sendToCustomer({
    customerId: params.customerId,
    orderId: params.orderId,
    text,
    kind: "status_update",
  });
}

/**
 * Владелец отклонил чек клиента.
 */
export async function notifyCustomerPaymentRejected(params: {
  customerId: string;
  orderId: string;
  orderNumber: number;
  reason?: string | null;
}) {
  const reasonLine = params.reason ? `\n\nПричина: ${params.reason}` : "";
  return sendToCustomer({
    customerId: params.customerId,
    orderId: params.orderId,
    text:
      `⚠️ Чек по заказу №${params.orderNumber} не подошёл.${reasonLine}\n\n` +
      `Пришли, пожалуйста, новый чек одним сообщением.`,
    kind: "status_update",
  });
}

/**
 * Заказ отправлен — с трек-номером.
 */
export async function notifyCustomerOrderShipped(params: {
  customerId: string;
  orderId: string;
  orderNumber: number;
  trackingNumber: string | null;
  deliveryService: string | null;
}) {
  const trackLine = params.trackingNumber ? `Трек: <code>${params.trackingNumber}</code>\n` : "";
  const serviceLine = params.deliveryService ? `Служба: ${params.deliveryService}\n` : "";
  return sendToCustomer({
    customerId: params.customerId,
    orderId: params.orderId,
    text: `📦 Заказ №${params.orderNumber} отправлен!\n\n` + serviceLine + trackLine,
    kind: "status_update",
  });
}

/**
 * Заказ прибыл в ПВЗ.
 */
export async function notifyCustomerOrderArrived(params: {
  customerId: string;
  orderId: string;
  orderNumber: number;
}) {
  return sendToCustomer({
    customerId: params.customerId,
    orderId: params.orderId,
    text: `✅ Заказ №${params.orderNumber} прибыл в пункт выдачи. Можно забирать.`,
    kind: "status_update",
  });
}

/**
 * «Плохое качество товара» — DM клиенту с media-group фотографий + caption
 * с инструкцией про обращение в Авито-поддержку (BUSINESS_LOGIC §6.4 расширение).
 * Деньги не возвращаются — это разбирает Авито-поддержка.
 *
 * Если фото не загрузились / partial — fallback на текстовое сообщение
 * со ссылкой на public URL каждого фото.
 */
export async function notifyCustomerOrderQualityIssue(params: {
  customerId: string;
  orderId: string;
  orderNumber: number;
  reason: string;
  photoUrls: string[];
}) {
  const db = getBotDb();
  const { data: customer } = await db
    .from("customers")
    .select("tg_user_id")
    .eq("id", params.customerId)
    .single();

  if (!customer || !customer.tg_user_id) {
    console.warn("notifyCustomerOrderQualityIssue: customer not found", params.customerId);
    return false;
  }

  const caption =
    `⚠️ Заказ №${params.orderNumber} — проблема при возврате\n\n` +
    `Отправщик принял посылку, но зафиксировал плохое качество товара.\n\n` +
    `<b>Описание проблемы:</b>\n${escapeHtmlMinimal(params.reason)}\n\n` +
    `К сожалению, деньги по этому возврату мы вернуть не можем — повреждение произошло уже после нашей отправки.\n\n` +
    `<b>Что делать:</b>\n` +
    `1. Напиши в поддержку Авито (раздел «Поддержка» → «Связаться с оператором»).\n` +
    `2. Опиши ситуацию: товар отправлялся в нормальном состоянии, а вернулся повреждённым.\n` +
    `3. Приложи фото из этого сообщения.\n\n` +
    `Авито-поддержка разберёт случай и при подтверждении вернёт средства.`;

  try {
    const bot = getCustomerBotForNotifications();

    if (params.photoUrls.length > 0) {
      // Telegram media-group: caption на первом фото, остальные без caption.
      // Лимит caption — 1024 символа; наше сообщение помещается.
      const media = params.photoUrls.slice(0, 10).map((url, i) => ({
        type: "photo" as const,
        media: url,
        ...(i === 0 ? { caption, parse_mode: "HTML" as const } : {}),
      }));
      await bot.api.sendMediaGroup(customer.tg_user_id, media);
    } else {
      await bot.api.sendMessage(customer.tg_user_id, caption, { parse_mode: "HTML" });
    }

    await db.from("order_messages").insert({
      order_id: params.orderId,
      tg_chat_id: customer.tg_user_id,
      tg_message_id: 0,
      kind: "status_update",
      direction: "outbound",
      body: caption,
      metadata: { dispute_photos: params.photoUrls },
    });

    return true;
  } catch (error) {
    console.error("notifyCustomerOrderQualityIssue failed:", error);
    return false;
  }
}

function escapeHtmlMinimal(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Заказ отменён.
 *
 * Если заказ был оплачен и идёт от партнёра — деньги возвращает партнёр
 * напрямую. В тексте даём контакт партнёра + контакт нашей поддержки на
 * случай некорректного поведения партнёра.
 */
export async function notifyCustomerOrderCancelled(params: {
  customerId: string;
  orderId?: string | null;
  orderNumber: number;
  reason?: string | null;
  partnerRefund?: {
    partnerLabel: string;
    supportUsername: string | null;
    amount: number;
  };
}) {
  const reasonLine = params.reason ? `\n\nПричина: ${params.reason}` : "";
  const refundLine = params.partnerRefund ? buildPartnerRefundLine(params.partnerRefund) : "";
  return sendToCustomer({
    customerId: params.customerId,
    orderId: params.orderId ?? undefined,
    text: `❌ Заказ №${params.orderNumber} отменён.${reasonLine}${refundLine}`,
    kind: "status_update",
  });
}

function buildPartnerRefundLine(info: {
  partnerLabel: string;
  supportUsername: string | null;
  amount: number;
}): string {
  const supportLine = info.supportUsername
    ? `\nЕсли возникнут проблемы — пиши в поддержку: @${info.supportUsername.replace(/^@/, "")}`
    : "";
  return `\n\n💰 Деньги возвращает партнёр напрямую: ${info.partnerLabel} — свяжись с ним и обсуди реквизиты для возврата.${supportLine}`;
}

/**
 * Заказ взят отправщиком в работу (paid → collecting).
 */
export async function notifyCustomerOrderCollecting(params: {
  customerId: string;
  orderId: string;
  orderNumber: number;
}) {
  return sendToCustomer({
    customerId: params.customerId,
    orderId: params.orderId,
    text: `🛠 Заказ №${params.orderNumber} взяли в работу — собираем.`,
    kind: "status_update",
  });
}

/**
 * Возникла проблема при сборке (paid|collecting → problem).
 * problemType:
 *   'out_of_stock' — размера нет на складе, ищем замену из возврата (системная задача).
 *   'bad_barcode'  — трек, который прислал клиент, не сканируется на ПВЗ при
 *     отправке (ответственность клиента — пришли новый трек).
 */
export async function notifyCustomerOrderProblem(params: {
  customerId: string;
  orderId: string;
  orderNumber: number;
  problemType: "out_of_stock" | "bad_barcode" | null;
  trackingNumber?: string | null;
}) {
  if (params.problemType === "bad_barcode") {
    const trackLine = params.trackingNumber
      ? `Твой трек \`${params.trackingNumber}\` не сканируется на ПВЗ при отправке.`
      : "Трек, который ты прислал, не сканируется на ПВЗ при отправке.";
    return sendToCustomer({
      customerId: params.customerId,
      orderId: params.orderId,
      text:
        `⚠️ Заказ №${params.orderNumber}\n\n` +
        `${trackLine}\n\n` +
        `Зайди в «📦 Мои заказы» → этот заказ → «✏️ Обновить трек отправки» — ` +
        `пришли новый номер, и заказ автоматически вернётся в работу.`,
      kind: "status_update",
    });
  }

  // out_of_stock или null (legacy) — расхождение склада, разруливает система.
  const detail =
    params.problemType === "out_of_stock"
      ? "Размера сейчас нет в наличии — ищем замену из ближайшего возврата."
      : "Разбираемся со складом.";
  return sendToCustomer({
    customerId: params.customerId,
    orderId: params.orderId,
    text:
      `⚠️ Заказ №${params.orderNumber} — нашли проблему.\n\n` +
      `${detail}\n\n` +
      `Напишем, как только будет ясность.`,
    kind: "status_update",
  });
}

/**
 * Возврат не удалось забрать с ПВЗ (return → trash, BUSINESS_LOGIC §6.5).
 * Деньги автоматически НЕ возвращаются. Текст разъясняет fault и куда писать.
 *
 * Для партнёрских заказов — отдельная ветка: возврат не доехал к
 * партнёру, передаём контакт партнёра и поддержки.
 */
export async function notifyCustomerOrderTrashed(params: {
  customerId: string;
  orderId: string;
  orderNumber: number;
  faultParty: "platform" | "client" | null;
  faultReason: "no_attempts" | "wrong_data" | "no_response" | "late_report" | null;
  partnerRefund?: { partnerLabel: string };
}) {
  const reasonText: Record<NonNullable<typeof params.faultReason>, string> = {
    no_attempts: "не успели забрать с нашей стороны",
    wrong_data: "неверные данные кода или трека",
    no_response: "не было ответа на наши запросы",
    late_report: "возврат оформили слишком поздно",
  };
  const supportUsername = await fetchSupportUsername();
  const supportHandle = supportUsername ? `@${supportUsername.replace(/^@/, "")}` : null;

  let tail: string;
  if (params.partnerRefund) {
    // Партнёрский: возврат до партнёра не доехал — это история партнёра.
    const supportLine = supportHandle
      ? `\nЕсли возникнут проблемы — пиши в поддержку: ${supportHandle}`
      : "";
    tail =
      `Возврат шёл к партнёру ${params.partnerRefund.partnerLabel} — обсудите с ним напрямую, ` +
      `что делать дальше.${supportLine}`;
  } else if (params.faultParty === "platform") {
    tail = supportHandle
      ? `Это наша вина. Напиши в поддержку — ${supportHandle} — разберёмся и вернём деньги.`
      : "Это наша вина. Напиши владельцу — разберёмся и вернём деньги.";
  } else {
    tail = supportHandle
      ? `Деньги по этому возврату не возвращаются. Если считаешь это ошибкой — пиши в поддержку: ${supportHandle}.`
      : "Деньги по этому возврату не возвращаются. Если считаешь это ошибкой — напиши владельцу.";
  }

  // Заголовок: для partner_warehouse без fault_reason используем общий
  // нейтральный текст; иначе — конкретная причина из адаптивной шкалы.
  const headerReason = params.faultReason ? reasonText[params.faultReason] : "не успели забрать";

  return sendToCustomer({
    customerId: params.customerId,
    orderId: params.orderId,
    text:
      `🗑 Возврат по заказу №${params.orderNumber} не удалось забрать — ${headerReason}.\n\n` +
      tail,
    kind: "status_update",
  });
}

/** Подгружает business_settings.support_telegram_username (читаем лениво,
 *  чтобы не тянуть БД при импорте модуля). */
async function fetchSupportUsername(): Promise<string | null> {
  try {
    const db = getBotDb();
    const { data } = await db
      .from("business_settings")
      .select("support_telegram_username")
      .maybeSingle();
    return (data?.support_telegram_username as string | null) ?? null;
  } catch (err) {
    console.error("[fetchSupportUsername] failed:", err);
    return null;
  }
}

/**
 * DM клиенту по результату попытки забора возврата на ПВЗ (BUSINESS_LOGIC §6.4).
 * Три варианта — разный текст и разные подсказки клиенту:
 *   • wrong_tracking — трек не подошёл, нужен новый (есть кнопка обновления).
 *   • wrong_code     — код был неверный; кнопкой обновлять бессмысленно
 *                       (код меняется каждые 24ч), нужно пришлать свежий
 *                       в день следующей попытки.
 *   • not_found      — отправщик был, посылки нет — клиент должен проверить
 *                       что реально отправил, и связаться с поддержкой.
 */
export async function notifyCustomerPickupAttemptFailed(params: {
  customerId: string;
  orderId: string;
  orderNumber: number;
  result: "wrong_tracking" | "wrong_code" | "not_found";
}) {
  const supportUsername = await fetchSupportUsername();
  const supportLine = supportUsername ? `\n\nПомощь: @${supportUsername.replace(/^@/, "")}` : "";

  let text: string;
  if (params.result === "wrong_tracking") {
    text =
      `⚠️ Заказ №${params.orderNumber}: трек возврата не подошёл.\n\n` +
      `Отправщик был на ПВЗ, но не смог найти посылку по этому треку. ` +
      `Обновите трек кнопкой в карточке заказа («📦 Мои заказы» → заказ → ` +
      `«✏️ Обновить трек возврата») — заберём в следующий раз.` +
      supportLine;
  } else if (params.result === "wrong_code") {
    text =
      `⚠️ Заказ №${params.orderNumber}: код возврата не подошёл.\n\n` +
      `Отправщик был на ПВЗ, но код не сработал. Код выдаёт служба ` +
      `доставки и обновляется каждые 24 часа — пришлите свежий код ` +
      `в день следующей попытки забора, иначе снова не получится.` +
      supportLine;
  } else {
    // not_found
    text =
      `⚠️ Заказ №${params.orderNumber}: посылки нет на ПВЗ.\n\n` +
      `Отправщик пришёл, но возврата там не оказалось. Проверь, что ` +
      `реально отправил посылку и трек верный. Если уверен — напиши в ` +
      `поддержку, разберёмся.` +
      supportLine;
  }

  return sendToCustomer({
    customerId: params.customerId,
    orderId: params.orderId,
    text,
    kind: "status_update",
  });
}

/**
 * DM владельцу/директору когда возврат ушёл в trash с виной платформы
 * (fault_party='platform'). Содержит сумму, контакт клиента и
 * причину — владельцу нужно вручную вернуть деньги.
 *
 * Адресуется по приоритету: директор → владелец (через
 * getDirectorPersonalHandle), но через DM в боты (а не handle), чтобы
 * сообщение пришло без действий со стороны получателя.
 */
export async function notifyOwnerTrashedPlatformFault(params: {
  orderNumber: number;
  orderId: string;
  amount: number;
  customerLabel: string;
  faultReason: "no_attempts" | "wrong_data" | "no_response" | "late_report";
}): Promise<boolean> {
  const reasonText: Record<typeof params.faultReason, string> = {
    no_attempts: "не успели забрать в установленные дни",
    wrong_data: "неверные данные кода или трека (наша обработка)",
    no_response: "не было ответа",
    late_report: "поздно оформили",
  };

  const text =
    `🗑 Возврат заказа №${params.orderNumber} ушёл в утиль — наша вина.\n\n` +
    `Сумма: <b>${formatPrice(params.amount)}</b>\n` +
    `Клиент: ${params.customerLabel}\n` +
    `Причина: ${reasonText[params.faultReason]}\n\n` +
    `Свяжись с клиентом и верни деньги вручную.`;

  // Приоритет: директор; fallback: владелец. Шлём в соответствующий бот.
  const db = getBotDb();
  const { data: biz } = await db
    .from("business_settings")
    .select("director_tg_user_id")
    .maybeSingle();
  const directorTgId = (biz?.director_tg_user_id as number | null) ?? null;
  if (directorTgId) {
    try {
      const bot = getDirectorBotForNotifications();
      await bot.api.sendMessage(directorTgId, text, { parse_mode: "HTML" });
      return true;
    } catch (err) {
      console.error("[notifyOwnerTrashedPlatformFault] director DM failed:", err);
    }
  }

  // Fallback на owner-bot.
  const ownerId = getOwnerTelegramId();
  if (ownerId) {
    try {
      const bot = getOwnerBotForNotifications();
      await bot.api.sendMessage(ownerId, text, { parse_mode: "HTML" });
      return true;
    } catch (err) {
      console.error("[notifyOwnerTrashedPlatformFault] owner DM failed:", err);
    }
  }

  return false;
}

/**
 * Возврат успешно забран отправщиком/партнёром (BUSINESS_LOGIC §6.4 «✅ Забран»).
 * Триггерится из executeCompleteReturn. Текст ветвится:
 *   • owner-source оплаченный: "X₽ зачислено на твой баланс".
 *   • partner-source оплаченный: "Деньги вернёт партнёр @ник напрямую +
 *     контакт нашей поддержки".
 *   • неоплаченный (+ВАЙБ-долг закрыт самим возвратом): без refund-строки.
 */
export async function notifyCustomerOrderReturnPickedUp(params: {
  customerId: string;
  orderId: string;
  orderNumber: number;
  refundedAmount?: number | null;
  partnerRefund?: {
    partnerLabel: string;
    supportUsername: string | null;
    amount: number;
  };
}) {
  let refundLine = "";
  if (params.partnerRefund) {
    refundLine = buildPartnerRefundLine(params.partnerRefund);
  } else if (params.refundedAmount && params.refundedAmount > 0) {
    refundLine = `\n\n💰 ${formatPrice(params.refundedAmount)} зачислено на твой баланс. Вывести можно через профиль.`;
  }
  return sendToCustomer({
    customerId: params.customerId,
    orderId: params.orderId,
    text:
      `✅ Возврат по заказу №${params.orderNumber} принят.\n\n` +
      `Спасибо! Если нужны новые заказы — каталог в главном меню.${refundLine}`,
    kind: "status_update",
  });
}

/**
 * Партнёру: клиент вернул его заказ, верни деньги напрямую. Используется
 * при `return_done` на партнёрском заказе (executeCompleteReturn) и при
 * cancel оплаченного партнёрского до отгрузки (cancelOrder).
 *
 * `kind`: `return_done` — возврат принят на ПВЗ;
 *         `cancelled` — клиент отменил после оплаты до отгрузки.
 */
export async function notifyPartnerOrderRefundDue(params: {
  partnerId: string;
  orderNumber: number;
  amount: number;
  customerLabel: string;
  supportUsername: string | null;
  kind: "return_done" | "cancelled";
}): Promise<boolean> {
  const supportLine = params.supportUsername
    ? `\nКонтакт нашей поддержки: @${params.supportUsername.replace(/^@/, "")}`
    : "";
  const headline =
    params.kind === "return_done"
      ? `↩️ Клиент вернул заказ №${params.orderNumber} — возврат принят на ПВЗ.`
      : `❌ Клиент отменил оплаченный заказ №${params.orderNumber}.`;
  const message =
    `${headline}\n\n` +
    `Сумма: <b>${formatPrice(params.amount)}</b>\n` +
    `Клиент: ${escapeHtmlLocal(params.customerLabel)}\n\n` +
    `Свяжись с клиентом и верни деньги напрямую — он у себя видит твой контакт.${supportLine}`;
  return sendToPartner({
    partnerId: params.partnerId,
    text: message,
  });
}

/**
 * Клиент заморожен — долг превысил лимит.
 */
export async function notifyCustomerVibeFrozen(params: {
  customerId: string;
  debt: number;
  required: number | null;
}) {
  const line = params.required
    ? `Текущий долг: <b>${formatPrice(params.debt)}</b>\n` +
      `Нужно оплатить больше чем: <b>${formatPrice(params.required)}</b>`
    : `Нужно оплатить весь текущий долг: <b>${formatPrice(params.debt)}</b>`;
  return sendToCustomer({
    customerId: params.customerId,
    text:
      `🔒 Твой аккаунт временно заморожен.\n\n` +
      `${line}\n\n` +
      `Чтобы продолжить оформлять заказы — погаси долг.`,
    kind: "status_update",
    replyMarkup: {
      inline_keyboard: [[{ text: "💳 Оплатить долг", callback_data: "vibe:pay:open" }]],
    },
  });
}

/**
 * Заморозка снята. 3 ветки текста по фактам:
 *   A) debt=0 — долг полностью погашен.
 *   B) cause=auto + debt>0 — авто-разморозка по достижении ручного порога.
 *   C) cause=admin_manual + debt>0 — владелец нажал «Разморозить», долг остался.
 */
export async function notifyCustomerVibeUnfrozen(params: {
  customerId: string;
  cause: "auto" | "admin_manual";
  debt: number;
}) {
  let text: string;
  if (params.debt <= 0) {
    text = `✅ Долг полностью погашен — заморозка снята.\n\nМожно снова оформлять заказы.`;
  } else if (params.cause === "auto") {
    text =
      `✅ Ты оплатил нужную сумму — заморозка снята.\n\n` +
      `Текущий долг: ${formatPrice(params.debt)}. Можно снова оформлять заказы.`;
  } else {
    text =
      `✅ Заморозка снята.\n\n` +
      `Текущий долг: ${formatPrice(params.debt)} — оплати, когда будет возможность.\n` +
      `Можно снова оформлять заказы.`;
  }
  return sendToCustomer({
    customerId: params.customerId,
    text,
    kind: "status_update",
  });
}

/**
 * Оплата (обычная или +ВАЙБ) подтверждена автоматически Vision'ом.
 * Если клиент заморожен с порогом — добавляем прогресс «оплачено X из Y».
 */
export async function notifyCustomerVibePaymentConfirmed(params: {
  customerId: string;
  amount: number;
}) {
  const db = getBotDb();
  const { data: customer } = await db
    .from("customers")
    .select("is_frozen, frozen_debt_snapshot, required_payment_amount")
    .eq("id", params.customerId)
    .maybeSingle();

  let extra = "";
  if (
    customer?.is_frozen &&
    customer.required_payment_amount != null &&
    Number(customer.required_payment_amount) > 0 &&
    customer.frozen_debt_snapshot != null
  ) {
    const { data: debtRow } = await db
      .from("customer_vibe_debt")
      .select("debt")
      .eq("customer_id", params.customerId)
      .maybeSingle();
    const currentDebt = Number(debtRow?.debt ?? 0);
    const snapshot = Number(customer.frozen_debt_snapshot);
    const required = Number(customer.required_payment_amount);
    const paid = Math.max(0, snapshot - currentDebt);
    const left = Math.max(0, required - paid);
    if (left > 0) {
      extra =
        `\n\n📊 До разморозки: оплачено <b>${formatPrice(paid)}</b> из ` +
        `<b>${formatPrice(required)}</b>, осталось <b>${formatPrice(left)}</b>.`;
    }
  }

  return sendToCustomer({
    customerId: params.customerId,
    text: `✅ Оплата <b>${formatPrice(params.amount)}</b> принята.${extra}`,
    kind: "status_update",
  });
}

/**
 * Чек требует ручной проверки владельцем.
 */
export async function notifyCustomerVibePaymentNeedsReview(params: { customerId: string }) {
  return sendToCustomer({
    customerId: params.customerId,
    text: `🧾 Чек получен. Мы проверим его вручную и напишем, как только подтвердим оплату.`,
    kind: "status_update",
  });
}

/**
 * Чек отклонён anti-replay (канон §8.1): operation_id уже использован
 * (для заказа или прошлого погашения долга). Терминальный текст —
 * повторная отправка ТОГО ЖЕ чека не поможет.
 */
export async function notifyCustomerVibePaymentReplay(params: { customerId: string }) {
  return sendToCustomer({
    customerId: params.customerId,
    text:
      `⚠️ Этот чек уже был зачтён ранее — повторно использовать его нельзя.\n\n` +
      `Если оплата долга так и не отобразилась — пришли чек именно этого перевода или напиши в поддержку.`,
    kind: "status_update",
  });
}

/**
 * Владелец выдал клиенту «+ВАЙБ» (vibe_enabled: false → true).
 * Отправляем экскурс что это, как пользоваться, лимит долга.
 */
export async function notifyCustomerVibeEnabled(params: {
  customerId: string;
  limit: number;
}): Promise<boolean> {
  const handle = await getDirectorPersonalHandle();
  const directorLine = handle ? `\n\nЕсли что — пиши ${handle}, разберёмся.` : "";
  const text =
    `🎉 Тебе открыли «+ВАЙБ» — статус, который позволяет заказывать в долг.\n\n` +
    `Что это даёт:\n` +
    `• Оформляешь заказ — товар сразу уходит в сборку, не ждём чек.\n` +
    `• Долг копится по каждому заказу. Гасишь когда удобно через «💳 Оплатить долг» в главном меню.\n` +
    `• Лимит долга — <b>${formatPrice(params.limit)}</b>. Когда упрёшься — оформление новых заказов приостановится до погашения.\n\n` +
    `⚠️ Не на всё работает: партнёрские товары, у которых партнёр не работает в долг, придётся оформлять обычной оплатой. Бот тебя предупредит на этапе выбора размера.` +
    directorLine;
  return sendToCustomer({
    customerId: params.customerId,
    text,
    kind: "status_update",
  });
}

/**
 * Лимит «+ВАЙБ» изменился (увеличился или уменьшился).
 * Текст разный в зависимости от направления.
 */
export async function notifyCustomerVibeLimitChanged(params: {
  customerId: string;
  oldLimit: number;
  newLimit: number;
}): Promise<boolean> {
  const increased = params.newLimit > params.oldLimit;
  const tail = increased
    ? `Теперь можешь оформлять заказы в долг до этой суммы.`
    : `Если текущий долг превышает новый лимит — оформление новых заказов приостановится до погашения.`;
  const text =
    `📊 Твой лимит «+ВАЙБ» изменили: <s>${formatPrice(params.oldLimit)}</s> → <b>${formatPrice(params.newLimit)}</b>.\n\n` +
    tail;
  return sendToCustomer({
    customerId: params.customerId,
    text,
    kind: "status_update",
  });
}

/**
 * Владелец снял с клиента «+ВАЙБ» (vibe_enabled: true → false).
 * Если есть незакрытый долг — клиент замораживается до погашения,
 * текст это объясняет. Если долга нет — простое уведомление об отключении.
 */
export async function notifyCustomerVibeDisabled(params: {
  customerId: string;
  currentDebt: number;
}): Promise<boolean> {
  const hasDebt = params.currentDebt > 0;
  const text = hasDebt
    ? `📊 С тебя сняли «+ВАЙБ». Текущий долг — <b>${formatPrice(params.currentDebt)}</b>.\n\n` +
      `До его полного погашения оформление новых заказов приостановлено. Как только долг закроется — снова можно оформлять (обычной оплатой).`
    : `📊 С тебя сняли «+ВАЙБ».\n\n` +
      `Теперь заказы оформляются только обычной оплатой — товар уходит в сборку после подтверждения чека.`;
  return sendToCustomer({
    customerId: params.customerId,
    text,
    kind: "status_update",
    ...(hasDebt
      ? {
          replyMarkup: {
            inline_keyboard: [[{ text: "💳 Оплатить долг", callback_data: "vibe:pay:open" }]],
          },
        }
      : {}),
  });
}

/**
 * Пересылает партнёру чек оплаты +ВАЙБ-долга. Используется в
 * recognize-receipt route='partner'.
 *
 * Канон подтверждения: единичный заказ — текстом «<номер> да/нет»
 * (`useTextFlow=true` → caption уже инструктирует, кнопки не вешаем);
 * группа из нескольких заказов — inline-кнопками `vibe-pay:confirm/reject`
 * (один тап закрывает всю группу).
 */
export async function sendVibeDebtReceiptToPartner(params: {
  partnerId: string;
  storagePath: string;
  caption: string;
  paymentId: string;
  useTextFlow?: boolean;
}): Promise<boolean> {
  const db = getBotDb();
  const { data: partner } = await db
    .from("partners")
    .select("name, tg_user_id, is_active")
    .eq("id", params.partnerId)
    .maybeSingle();

  // Если партнёр недоступен (удалён/деактивирован/не привязан к Telegram)
  // — эскалация владельцу, чтобы он разрулил руками.
  if (!partner || !partner.tg_user_id || !partner.is_active) {
    console.warn(
      `sendVibeDebtReceiptToPartner: partner ${params.partnerId} unavailable (active=${partner?.is_active}, tg=${partner?.tg_user_id}) — escalating to owner`
    );
    await sendOwnerEscalation({
      title: "Партнёр недоступен — оплата +ВАЙБ-долга",
      message:
        `⚠️ Не удалось доставить чек партнёру «${partner?.name ?? params.partnerId}» — ` +
        `он деактивирован или не привязан к боту.\n\n` +
        `vibe_payment_id: <code>${params.paymentId}</code>\n\n` +
        `Разрули вручную: проверь чек в БД, подтверди оплату или отклони.`,
    }).catch((e) => console.error("escalation send failed:", e));
    return false;
  }

  // Скачиваем фото из приватного bucket'а receipts.
  const { data: file, error: dlError } = await db.storage
    .from("receipts")
    .download(params.storagePath);
  if (dlError || !file) {
    console.error("sendVibeDebtReceiptToPartner download failed:", dlError);
    await sendOwnerEscalation({
      title: "Не удалось скачать чек +ВАЙБ-долга",
      message:
        `⚠️ vibe_payment_id <code>${params.paymentId}</code>: чек не скачался из storage. ` +
        `Партнёру не отправлен. Проверь bucket receipts.`,
    }).catch((e) => console.error("escalation send failed:", e));
    return false;
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  const { InputFile, InlineKeyboard } = await import("grammy");

  // Группа из нескольких заказов — кнопки. Единичный — caption уже
  // инструктирует «N да/нет», кнопки не показываем (партнёр отвечает
  // текстом через parsePaymentConfirmation в partner-bot).
  const kb = params.useTextFlow
    ? undefined
    : new InlineKeyboard()
        .text("✅ Получил деньги", `vibe-pay:confirm:${params.paymentId}`)
        .row()
        .text("❌ Не пришли", `vibe-pay:reject:${params.paymentId}`);

  try {
    const bot = getPartnerBotForNotifications();
    await bot.api.sendPhoto(partner.tg_user_id, new InputFile(buffer, "receipt.jpg"), {
      caption: params.caption,
      parse_mode: "HTML",
      ...(kb ? { reply_markup: kb } : {}),
    });
    return true;
  } catch (error) {
    console.error("sendVibeDebtReceiptToPartner send failed:", error);
    await sendOwnerEscalation({
      title: "Не удалось отправить чек партнёру",
      message:
        `⚠️ vibe_payment_id <code>${params.paymentId}</code>: Telegram отверг отправку (бот заблокирован?). ` +
        `Партнёру: «${partner.name ?? params.partnerId}». Разрули вручную.`,
    }).catch((e) => console.error("escalation send failed:", e));
    return false;
  }
}

/**
 * Отправить владельцу AI-сгенерированное фото объявления на подтверждение
 * («Четко» / «Переделай»). Возвращает message_id (для последующего
 * editMessageCaption) или null.
 */
export async function notifyOwnerAiPhotoForApproval(params: {
  generationId: string;
  buffer: Buffer;
  caption: string;
  /** Кому слать — chat_id из карточки товара (cover_tg_chat_id). Без дефолта на владельца (канон §2.7). */
  chatId?: number | null;
}): Promise<number | null> {
  const target = params.chatId ?? null;
  if (!target) {
    console.warn("[notifyOwnerAiPhotoForApproval] нет chatId получателя — не шлём (без дефолта на owner)");
    return null;
  }
  const { InlineKeyboard } = await import("grammy");
  const kb = new InlineKeyboard()
    .text("✅ Четко", `aiphoto:ok:${params.generationId}`)
    .text("🔄 Переделай", `aiphoto:redo:${params.generationId}`);
  try {
    const bot = getAiPhotosBotForNotifications();
    const msg = await bot.api.sendPhoto(target, new InputFile(params.buffer, "ai-photo.jpg"), {
      caption: params.caption,
      parse_mode: "HTML",
      reply_markup: kb,
    });
    return msg.message_id;
  } catch (e) {
    console.error("notifyOwnerAiPhotoForApproval send failed:", e);
    return null;
  }
}

/**
 * Сравнивает «было» с актуальным is_frozen в БД и, если изменилось,
 * ставит DM-уведомление (notify-vibe-frozen / notify-vibe-unfrozen).
 *
 * Вызывается из мест, после которых триггер `check_vibe_credit_freeze`
 * мог переключить customers.is_frozen: создание/cancel +ВАЙБ-заказа,
 * apply_overpayment, vibe_payments, изменение лимита из owner-panel.
 *
 * Caller передаёт `wasFrozen` — снимок ДО операции (читается одним
 * запросом перед действием). Внутри хелпер дочитывает текущее значение
 * и сравнивает.
 */
export async function maybeNotifyFrozenChange(
  customerId: string,
  wasFrozen: boolean | null
): Promise<void> {
  const db = getBotDb();
  const { data } = await db
    .from("customers")
    .select("is_frozen")
    .eq("id", customerId)
    .maybeSingle();
  if (!data) return;
  const isFrozen = !!data.is_frozen;
  if (isFrozen === !!wasFrozen) return;
  const { scheduleNotifyVibeFrozen } = await import("@/lib/jobs/queues");
  await scheduleNotifyVibeFrozen(customerId, isFrozen).catch((err) => {
    console.error("[maybeNotifyFrozenChange] schedule failed:", err);
  });
}
