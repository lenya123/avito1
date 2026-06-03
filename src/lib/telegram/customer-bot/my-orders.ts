/**
 * Раздел «📦 Мои заказы» в customer-bot.
 *
 * BUSINESS_LOGIC.md §12.4-§12.5: список заказов клиента с 6 фильтрами +
 * детальная карточка с inline-кнопками по контексту статуса.
 *
 * Тексты — placeholder; будут переработаны после первой smoke-сессии.
 */

import type { Context } from "grammy";
import { InlineKeyboard, InputFile } from "grammy";
import { getBotDb } from "../db";
import type { Customer } from "../bots/customer-bot";
import { parseFlexibleDate } from "@/lib/utils/moscow-time";
import { getOrderReceipts, downloadOrderReceipt } from "@/lib/orders/receipts";
import {
  CUSTOMER_STATUS_EMOJI as STATUS_EMOJI,
  CUSTOMER_STATUS_LABEL as STATUS_LABEL,
} from "./order-status-display";

const PAGE_SIZE = 10;

export type OrderFilter =
  | "all"
  | "active"
  | "shipped"
  | "returns_open"
  | "returns_closed"
  | "cancelled";

const FILTER_LABELS: Record<OrderFilter, string> = {
  all: "Все",
  active: "Активные",
  shipped: "Успешные",
  returns_open: "Возвраты",
  returns_closed: "Закрытые",
  cancelled: "Отменённые",
};

const FILTER_STATUSES: Record<OrderFilter, string[] | null> = {
  all: null, // null → без фильтра по status
  active: ["paid", "collecting", "problem"],
  shipped: ["sent"],
  returns_open: ["return", "trash"],
  returns_closed: ["return_done"],
  cancelled: ["cancelled"],
};

// STATUS_EMOJI / STATUS_LABEL — единый клиентский справочник
// (./order-status-display). Было локально, расходилось с группой.

interface OrderListRow {
  id: string;
  order_number: number;
  status: string;
  client_price: number | null;
  send_by: string | null;
  pickup_by: string | null;
  created_at: string | null;
  product?: { name: string | null } | null;
  size: string | null;
  tracking_number: string | null;
}

/**
 * Открыть список заказов клиента (с фильтром).
 * Шлёт новое сообщение с inline-клавиатурой.
 */
export async function openMyOrders(
  ctx: Context,
  customer: Customer,
  filter: OrderFilter = "active",
  page: number = 0,
  options: { editExisting?: boolean } = {}
): Promise<void> {
  const db = getBotDb();
  const statuses = FILTER_STATUSES[filter];

  let query = db
    .from("orders")
    .select(
      "id, order_number, status, client_price, send_by, pickup_by, created_at, size, tracking_number, product:products(name)",
      { count: "exact" }
    )
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (statuses) {
    query = query.in("status", statuses);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("[my-orders] query failed:", error.message);
    await ctx.reply("Не удалось загрузить заказы. Попробуй позже.");
    return;
  }

  const orders = (data ?? []) as unknown as OrderListRow[];
  const total = count ?? orders.length;
  const text = formatOrdersList(filter, orders, total, page);
  const kb = buildOrdersListKeyboard(filter, orders, page, total);

  if (options.editExisting && ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {
      // ignore — fallback на новое сообщение ниже
    }
  }

  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}

function formatOrdersList(
  filter: OrderFilter,
  orders: OrderListRow[],
  total: number,
  page: number
): string {
  const header = `📦 <b>Мои заказы</b> · ${FILTER_LABELS[filter]}`;

  if (orders.length === 0) {
    return `${header}\n\nЗдесь пока пусто.`;
  }

  const lines = [header];
  for (const o of orders) {
    const emoji = STATUS_EMOJI[o.status] ?? "📋";
    const label = STATUS_LABEL[o.status] ?? o.status;
    const productName = o.product?.name ?? "—";
    const size = o.size ? ` · ${o.size}` : "";
    const track = o.tracking_number ? ` · ${escapeHtml(o.tracking_number)}` : "";
    const price = o.client_price != null ? ` · ${formatPrice(o.client_price)}` : "";
    lines.push("");
    lines.push(
      `<b>№${o.order_number}</b> · ${emoji} ${label}${price}\n${escapeHtml(productName)}${size}${track}`
    );
  }

  return lines.join("\n");
}

function buildOrdersListKeyboard(
  filter: OrderFilter,
  orders: OrderListRow[],
  page: number,
  total: number
): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Filter row 1
  kb.text(checkLabel("active", filter), `myorders:f:active`)
    .text(checkLabel("shipped", filter), `myorders:f:shipped`)
    .text(checkLabel("returns_open", filter), `myorders:f:returns_open`)
    .row()
    .text(checkLabel("returns_closed", filter), `myorders:f:returns_closed`)
    .text(checkLabel("cancelled", filter), `myorders:f:cancelled`)
    .text(checkLabel("all", filter), `myorders:f:all`)
    .row();

  // One button per order — открыть карточку.
  for (const o of orders) {
    const emoji = STATUS_EMOJI[o.status] ?? "📋";
    kb.text(`${emoji} №${o.order_number}`, `myorders:card:${o.id}`).row();
  }

  // Pagination — показываем «1 из 3» / «2 из 3» на самих кнопках вместо «пред/след».
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages > 1) {
    if (page > 0) {
      kb.text(`« ${page} из ${totalPages}`, `myorders:p:${filter}:${page - 1}`);
    }
    if (page < totalPages - 1) {
      kb.text(`${page + 2} из ${totalPages} »`, `myorders:p:${filter}:${page + 1}`);
    }
    kb.row();
  }

  kb.text("↩️ В главное меню", "customer:main");

  return kb;
}

function checkLabel(f: OrderFilter, current: OrderFilter): string {
  return f === current ? `· ${FILTER_LABELS[f]} ·` : FILTER_LABELS[f];
}

// =====================================================================
// Карточка заказа
// =====================================================================

interface OrderCardRow {
  id: string;
  order_number: number;
  status: string;
  problem_type: string | null;
  client_price: number | null;
  send_by: string | null;
  pickup_by: string | null;
  tracking_number: string | null;
  return_tracking_number: string | null;
  return_code: string | null;
  delivery_service: string | null;
  size: string | null;
  partner_id: string | null;
  return_attempts_count: number;
  is_paid: boolean;
  created_at: string | null;
  shipped_at: string | null;
  return_completed_at: string | null;
  customer_id: string | null;
  dispute_reason: string | null;
  product: { name: string | null; photo_urls: string[] | null } | null;
  partner: { tg_username: string | null; name: string | null } | null;
}

interface OrderCardContext {
  supportUsername: string | null;
}

/**
 * Открыть детальную карточку заказа.
 * Проверяет, что заказ принадлежит этому клиенту (защита от подделки orderId).
 */
export async function openOrderCard(
  ctx: Context,
  customer: Customer,
  orderId: string,
  options: { editExisting?: boolean } = {}
): Promise<void> {
  const db = getBotDb();

  const { data, error } = await db
    .from("orders")
    .select(
      `
      id, order_number, status, problem_type, client_price, send_by, pickup_by,
      tracking_number, return_tracking_number, return_code, delivery_service,
      size, partner_id, return_attempts_count, is_paid, created_at,
      shipped_at, return_completed_at, customer_id, dispute_reason,
      product:products(name, photo_urls),
      partner:partners!partner_id(tg_username, name)
      `
    )
    .eq("id", orderId)
    .eq("customer_id", customer.id)
    .single();

  if (error || !data) {
    await ctx.reply("Заказ не найден.");
    return;
  }

  const order = data as unknown as OrderCardRow;

  // Подгружаем support_telegram_username — нужен для refund-инфо в партнёрских
  // отменах/возвратах. Один лёгкий запрос за карточку — не критично.
  const orderCtx: OrderCardContext = { supportUsername: null };
  if (order.partner_id && order.is_paid) {
    const { data: settings } = await db
      .from("business_settings")
      .select("support_telegram_username")
      .limit(1)
      .maybeSingle();
    orderCtx.supportUsername = (settings?.support_telegram_username as string | null) ?? null;
  }

  const text = formatOrderCard(order, orderCtx);
  const kb = buildOrderCardKeyboard(order);

  if (options.editExisting && ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
      // При editExisting не дублируем фото-чек — оно уже было отправлено
      // в первый раз когда клиент пришёл сюда из «Мои заказы».
      return;
    } catch {
      // ignore — упадём на reply ниже
    }
  }

  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });

  // Фото-чеков (если есть) — отдельными сообщениями после карточки.
  // Walkthrough фазы 2 #3: клиент видит чек дважды — в нативной истории
  // чата (Медиа) и внутри подробной карточки как аудит-журнал. Источники
  // двух видов (прямая оплата + vibe-погашения) сливает helper getOrderReceipts.
  forwardOrderReceipts(ctx, db, orderId).catch((e) =>
    console.error("[my-orders] forwardOrderReceipts failed:", e)
  );
}

async function forwardOrderReceipts(
  ctx: Context,
  db: ReturnType<typeof getBotDb>,
  orderId: string
): Promise<void> {
  const receipts = await getOrderReceipts(db, orderId);
  if (receipts.length === 0) return;

  const { InputFile } = await import("grammy");
  const multiple = receipts.length > 1;

  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];
    const file = await downloadOrderReceipt(db, receipt.storagePath);
    if (!file) continue;

    const caption = multiple
      ? `🧾 Чек ${i + 1} из ${receipts.length}${receipt.source === "vibe" ? " (+ВАЙБ)" : ""}`
      : `🧾 Чек оплаты${receipt.source === "vibe" ? " (+ВАЙБ)" : ""}`;

    if (file.isPdf) {
      await ctx.replyWithDocument(new InputFile(file.buffer, "чек.pdf"), { caption });
    } else {
      await ctx.replyWithPhoto(new InputFile(file.buffer, "receipt.jpg"), { caption });
    }
  }
}

function formatOrderCard(order: OrderCardRow, ctx: OrderCardContext): string {
  const emoji = STATUS_EMOJI[order.status] ?? "📋";
  const label = STATUS_LABEL[order.status] ?? order.status;
  const product = order.product?.name ?? "—";
  const size = order.size ? `Размер: <b>${escapeHtml(order.size)}</b>` : "";
  const sourceLabel = order.partner_id ? "🤝 Партнёрский товар" : "🏠 Товар магазина";

  const lines: string[] = [
    `${emoji} <b>Заказ №${order.order_number}</b>`,
    `Статус: ${label}`,
    `<i>${sourceLabel}</i>`,
    "",
    `<b>${escapeHtml(product)}</b>`,
  ];
  if (size) lines.push(size);
  if (order.client_price != null) lines.push(`Цена: <b>${formatPrice(order.client_price)}</b>`);
  if (order.delivery_service) lines.push(`Служба: ${order.delivery_service}`);
  if (order.tracking_number) lines.push(`Трек: <code>${escapeHtml(order.tracking_number)}</code>`);
  if (order.send_by && ["paid", "collecting", "problem"].includes(order.status)) {
    lines.push(`Отправить до: <b>${formatDateRu(order.send_by)}</b>`);
  }
  if (order.status === "sent" && order.shipped_at) {
    lines.push(`Отправлено: <b>${formatDateRu(order.shipped_at)}</b>`);
  }
  if (order.status === "return" || order.status === "trash") {
    if (order.return_tracking_number) {
      lines.push("");
      lines.push(`Трек возврата: <code>${escapeHtml(order.return_tracking_number)}</code>`);
    }
    if (order.return_code) {
      lines.push(`Код возврата: <code>${escapeHtml(order.return_code)}</code>`);
    }
    if (order.pickup_by) {
      lines.push(`Забрать до: <b>${formatDateRu(order.pickup_by)}</b>`);
    }
  }
  if (order.status === "return_done" && order.return_completed_at) {
    lines.push(`Возврат принят: <b>${formatDateRu(order.return_completed_at)}</b>`);
  }
  if (order.status === "trash" && order.return_attempts_count >= 2) {
    lines.push("");
    lines.push("Повторное оформление возврата недоступно (исчерпан лимит).");
  }
  if (order.status === "return_done" && order.dispute_reason) {
    lines.push("");
    lines.push(`⚠️ Причина: ${escapeHtml(order.dispute_reason)}`);
  }
  if (order.status === "problem") {
    lines.push("");
    if (order.problem_type === "bad_barcode") {
      lines.push("Трек не сканируется на ПВЗ. Пришли новый кнопкой ниже — и заказ снова в работу.");
    } else {
      lines.push("Товара временно нет. Если не появится до срока — заказ отменим и вернём деньги.");
    }
  }
  if (order.status === "paid" && !order.is_paid) {
    lines.push("");
    lines.push("Оплачен в долг (+ВАЙБ). Сумма учтена в общем долге.");
  }

  // Флажок «возвращены ли деньги» — для статусов где это бывает.
  // Owner-source: авто-credit на customer_balance, идёт через триггер.
  // Partner-source: партнёр сам возвращает напрямую → показываем контакт
  // партнёра + поддержки, чтобы клиент мог решить вопрос.
  if (order.is_paid && order.client_price != null) {
    const isPartnerOrder = !!order.partner_id;
    const isRefundStatus =
      order.status === "cancelled" || (order.status === "return_done" && !order.dispute_reason);

    if (isRefundStatus && isPartnerOrder) {
      const partnerLabel = order.partner?.tg_username
        ? `@${order.partner.tg_username.replace(/^@/, "")}`
        : (order.partner?.name ?? "партнёр");
      lines.push("");
      lines.push(
        `💰 Деньги возвращает партнёр напрямую: ${escapeHtml(partnerLabel)} — свяжись с ним и обсуди реквизиты для возврата.`
      );
      if (ctx.supportUsername) {
        lines.push(
          `Если возникнут проблемы — пиши в поддержку: @${escapeHtml(ctx.supportUsername.replace(/^@/, ""))}`
        );
      }
    } else if (isRefundStatus) {
      lines.push("");
      lines.push(`💰 ${formatPrice(order.client_price)} возвращены на баланс.`);
    } else if (order.status === "trash") {
      lines.push("");
      lines.push("💰 Деньги по этому возврату не возвращаются автоматически.");
    } else if (order.status === "return_done" && order.dispute_reason) {
      lines.push("");
      lines.push("💰 Деньги не возвращены — разбирается Авито-поддержка.");
    }
  }

  if (order.created_at) {
    lines.push("");
    lines.push(`<i>Создан: ${formatDateRu(order.created_at)}</i>`);
  }
  return lines.join("\n");
}

function buildOrderCardKeyboard(order: OrderCardRow): InlineKeyboard {
  const kb = new InlineKeyboard();
  const id = order.id;

  switch (order.status) {
    case "paid":
    case "collecting":
      kb.text("📅 Изменить срок отправки", `order:editsendby:${id}`)
        .row()
        .text("❌ Отменить заказ", `order:cancel:${id}`)
        .row();
      break;
    case "sent":
      kb.text("↩️ Оформить возврат", `return:start:${id}`).row();
      break;
    case "return":
      kb.text("📅 Изменить срок забора", `order:editpickupby:${id}`).row();
      kb.text("✏️ Обновить трек возврата", `return:edittrack:${id}`).row();
      kb.text("✏️ Обновить код возврата", `return:editcode:${id}`).row();
      kb.text("❌ Отменить возврат", `return:cancel:${id}`).row();
      break;
    case "return_done":
      break;
    case "trash":
      if (order.return_attempts_count < 2) {
        kb.text("🔄 Переоткрыть возврат", `return:reopen:${id}`).row();
      }
      kb.text("✉️ Написать владельцу", `order:contact_owner:${id}`).row();
      break;
    case "cancelled":
      kb.text("✉️ Написать владельцу", `order:contact_owner:${id}`).row();
      break;
    case "problem":
      if (order.problem_type === "bad_barcode") {
        kb.text("✏️ Обновить трек отправки", `order:fixtrack:${id}`).row();
      }
      kb.text("❌ Отменить заказ", `order:cancel:${id}`).row();
      break;
  }

  kb.text("« К списку", "myorders:back");
  return kb;
}

// =====================================================================
// Утилиты форматирования
// =====================================================================

function formatPrice(p: number): string {
  return `${Number(p).toLocaleString("ru-RU")} ₽`;
}

function formatDateRu(iso: string): string {
  return parseFlexibleDate(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
