/**
 * Постинг карточек заказа и чеков в Telegram-группы (Stage 3.7).
 *
 * Архитектура (refactor 2026-04-27):
 *  - **Клиентская группа** (`TELEGRAM_ORDERS_GROUP_ID`) — карточки заказов
 *    и возвратов. Видна клиентам. Топики: orders_topic_id / returns_topic_id
 *    в business_settings.
 *  - **Приватная группа «ЧЕКИ»** (`TELEGRAM_RECEIPTS_GROUP_ID`) — фото
 *    чеков от клиентов. Видна только владельцу + помощникам.
 *
 * **Все** group-посты идут через **customer-bot** (брендовое имя).
 * Owner-bot никогда не светится в группах — это намеренно «секретный»
 * внутренний бот для DM-алертов владельцу с непредсказуемым именем.
 *
 * Если группа/токен/топик не настроены — функции тихо no-op (бот не
 * должен падать, если вендор пока не настроил группу).
 */

import { Bot } from "grammy";
import { getBotDb } from "./db";
import { CUSTOMER_STATUS_EMOJI as STATUS_EMOJI } from "./customer-bot/order-status-display";

let customerBotForGroup: Bot | null = null;
function getCustomerBotForGroup(): Bot {
  if (!customerBotForGroup) {
    const token = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_CUSTOMER_BOT_TOKEN is not set");
    customerBotForGroup = new Bot(token);
  }
  return customerBotForGroup;
}

function parseChatId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function getOrdersGroupChatId(): number | null {
  return parseChatId(process.env.TELEGRAM_ORDERS_GROUP_ID);
}

function getReceiptsGroupChatId(): number | null {
  return parseChatId(process.env.TELEGRAM_RECEIPTS_GROUP_ID);
}

async function getTopicIds() {
  const db = getBotDb();
  const { data } = await db
    .from("business_settings")
    .select("orders_topic_id, returns_topic_id")
    .limit(1)
    .maybeSingle();
  return {
    orders: data?.orders_topic_id ?? null,
    returns: data?.returns_topic_id ?? null,
  };
}

// STATUS_EMOJI — единый клиентский справочник
// (./customer-bot/order-status-display). Было локально и расходилось с
// «Мои заказы»: один и тот же статус — разные эмодзи для клиента.

/**
 * Статусы, при которых заказ уходит из «ленты живой активности» в группе.
 * Возвраты и отмены не имеют ценности в публичной группе клиентов —
 * наоборот, шлют негативный сигнал. Отказываемся от обновления карточки
 * и удаляем её, чтобы группа отражала только актуальные «живые» заказы.
 */
const REMOVED_FROM_GROUP_STATUSES = new Set(["return", "return_done", "cancelled", "trash"]);

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface OrderSummaryInput {
  orderId: string;
  orderNumber: number;
  status: string;
  productName: string | null;
  size: string | null;
  customerUsername: string | null;
  deliveryService: string | null;
  trackingNumber: string | null;
  dispatchCity: string | null;
}

function buildSummaryText(o: OrderSummaryInput): string {
  const emoji = STATUS_EMOJI[o.status] ?? "•";
  const lines = [
    `${emoji} Заказ <b>№${o.orderNumber}</b>`,
    `Товар: ${escapeHtml(o.productName ?? "—")}${o.size ? ` · ${escapeHtml(o.size)}` : ""}`,
    ...(o.dispatchCity ? [`🏙️ Город: ${escapeHtml(o.dispatchCity)}`] : []),
    `📦 Доставка: ${escapeHtml(o.deliveryService ?? "—")}`,
    `Трек: ${o.trackingNumber ? `<code>${escapeHtml(o.trackingNumber)}</code>` : "—"}`,
    `Клиент: ${o.customerUsername ? `@${escapeHtml(o.customerUsername)}` : "—"}`,
  ];
  return lines.join("\n");
}

/**
 * Постит summary заказа в топик «Заказы». Сохраняет tg_message_id в
 * order_messages(kind='summary', direction='outbound') — используется
 * для последующего edit при смене статуса.
 */
export async function postOrderSummary(input: OrderSummaryInput): Promise<void> {
  const groupId = getOrdersGroupChatId();
  if (!groupId) return;

  const { orders: ordersTopicId } = await getTopicIds();
  if (!ordersTopicId) return;

  try {
    const message = await getCustomerBotForGroup().api.sendMessage(
      groupId,
      buildSummaryText(input),
      {
        parse_mode: "HTML",
        message_thread_id: ordersTopicId,
      }
    );

    const db = getBotDb();
    await db.from("order_messages").insert({
      order_id: input.orderId,
      tg_chat_id: groupId,
      tg_message_id: message.message_id,
      tg_thread_id: ordersTopicId,
      kind: "summary",
      direction: "outbound",
      body: buildSummaryText(input),
    });
  } catch (error) {
    console.error("[orders-group] postOrderSummary failed:", error);
  }
}

/**
 * Редактирует ранее запостенный summary. Если статус заказа уходит в
 * `REMOVED_FROM_GROUP_STATUSES` — карточку вместо обновления удаляем.
 */
export async function editOrderSummary(input: OrderSummaryInput): Promise<void> {
  const groupId = getOrdersGroupChatId();
  if (!groupId) return;

  if (REMOVED_FROM_GROUP_STATUSES.has(input.status)) {
    await deleteOrderSummary(input.orderId);
    return;
  }

  const db = getBotDb();
  const { data: message } = await db
    .from("order_messages")
    .select("tg_chat_id, tg_message_id, tg_thread_id")
    .eq("order_id", input.orderId)
    .eq("kind", "summary")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!message?.tg_message_id) return;

  try {
    await getCustomerBotForGroup().api.editMessageText(
      message.tg_chat_id,
      message.tg_message_id,
      buildSummaryText(input),
      { parse_mode: "HTML" }
    );
  } catch (error) {
    // Часто: "message is not modified" — это ок.
    const msg = (error as Error).message ?? "";
    if (!msg.includes("message is not modified")) {
      console.error("[orders-group] editOrderSummary failed:", error);
    }
  }
}

/**
 * Удаляет карточку заказа из группы (если есть) и зачищает связанную
 * order_messages-строку. Используется при переходе в return/cancelled —
 * заказ исчезает из «ленты живой активности».
 */
export async function deleteOrderSummary(orderId: string): Promise<void> {
  const groupId = getOrdersGroupChatId();
  if (!groupId) return;

  const db = getBotDb();
  const { data: message } = await db
    .from("order_messages")
    .select("id, tg_chat_id, tg_message_id")
    .eq("order_id", orderId)
    .eq("kind", "summary")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!message?.tg_message_id) return;

  try {
    await getCustomerBotForGroup().api.deleteMessage(message.tg_chat_id, message.tg_message_id);
  } catch (error) {
    // Сообщение могло быть удалено вручную, или старше 48ч (Telegram-лимит) —
    // не считаем ошибкой, всё равно чистим order_messages чтобы не пытаться снова.
    const msg = (error as Error).message ?? "";
    if (!msg.includes("message to delete not found")) {
      console.error("[orders-group] deleteOrderSummary failed:", error);
    }
  }

  await db.from("order_messages").delete().eq("id", message.id);
}

/**
 * Атомарно: если карточка заказа в группе уже есть — edit, иначе — post.
 * Используется на подтверждении оплаты (Vision / партнёр / владелец вручную) —
 * до этого момента заказ в группе не виден, после — карточка появляется.
 */
export async function upsertOrderSummary(input: OrderSummaryInput): Promise<void> {
  if (REMOVED_FROM_GROUP_STATUSES.has(input.status)) {
    await deleteOrderSummary(input.orderId);
    return;
  }

  const db = getBotDb();
  const { data: message } = await db
    .from("order_messages")
    .select("tg_message_id")
    .eq("order_id", input.orderId)
    .eq("kind", "summary")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (message?.tg_message_id) {
    await editOrderSummary(input);
  } else {
    await postOrderSummary(input);
  }
}

/**
 * Постит фото чека в приватную группу «ЧЕКИ» (TELEGRAM_RECEIPTS_GROUP_ID),
 * без топиков и без reply (группа отдельная, у клиентского-summary туда
 * нет таргета). Caption должен быть самодостаточным — содержать номер
 * заказа, клиента и сумму.
 */
export async function postReceiptToGroup(params: {
  orderId: string;
  photoFileId: string;
  caption: string;
}): Promise<void> {
  const groupId = getReceiptsGroupChatId();
  if (!groupId) return;

  try {
    await getCustomerBotForGroup().api.sendPhoto(groupId, params.photoFileId, {
      caption: params.caption,
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error("[orders-group] postReceiptToGroup failed:", error);
  }
}

/**
 * Помощник для построения OrderSummaryInput из сырого orders-row.
 */
export async function buildSummaryFromOrderId(orderId: string): Promise<OrderSummaryInput | null> {
  const db = getBotDb();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, order_number, status, customer_id, delivery_service, size, product_id, product_size_id, tracking_number, dispatch_city"
    )
    .eq("id", orderId)
    .single();

  if (!order) return null;

  const [{ data: customer }, { data: product }, { data: size }] = await Promise.all([
    order.customer_id
      ? db.from("customers").select("telegram_username").eq("id", order.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    order.product_id
      ? db.from("products").select("name").eq("id", order.product_id).maybeSingle()
      : Promise.resolve({ data: null }),
    order.product_size_id
      ? db.from("product_sizes").select("size").eq("id", order.product_size_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    status: order.status ?? "paid",
    productName: product?.name ?? null,
    size: size?.size ?? order.size ?? null,
    customerUsername: customer?.telegram_username ?? null,
    deliveryService: order.delivery_service,
    trackingNumber: order.tracking_number ?? null,
    dispatchCity: order.dispatch_city ?? null,
  };
}
