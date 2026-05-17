/**
 * Система уведомлений через Telegram
 *
 * Отправляет уведомления пользователям через соответствующие боты.
 */

import { Bot } from "grammy";
import { getBotDb } from "./db";
import { formatPrice, formatDeliveryService, SUBSCRIPTION_LABELS } from "./utils/formatters";

// Типы уведомлений
export type NotificationType =
  // Для клиентов
  | "order_paid"
  | "order_shipped"
  | "order_completed"
  | "return_arrived"
  | "return_code_needed"
  | "level_up"
  | "new_product"
  | "product_available"
  | "subscription_expiring"
  | "subscription_expired"
  | "order_overdue"
  // Для отправщиков
  | "new_orders"
  | "urgent_orders"
  | "returns_ready"
  // Для владельца
  | "new_order"
  | "order_problem"
  | "new_subscription"
  | "vibe_debt"
  | "vibe_limit_reached"
  | "product_low_stock"
  | "order_not_shipped"
  | "daily_summary";

export interface NotificationPayload {
  userId?: string;
  telegramId?: number;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  channels?: ("telegram" | "push" | "email")[];
}

// Кэш для ботов
let clientBotInstance: Bot | null = null;
let shipperBotInstance: Bot | null = null;
let ownerBotInstance: Bot | null = null;

function getClientBotForNotifications(): Bot {
  if (!clientBotInstance) {
    const token = process.env.TELEGRAM_CLIENT_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_CLIENT_BOT_TOKEN is not set");
    clientBotInstance = new Bot(token);
  }
  return clientBotInstance;
}

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

/**
 * Основная функция отправки уведомления
 */
export async function sendNotification(payload: NotificationPayload): Promise<boolean> {
  const db = getBotDb();

  try {
    // Определяем telegram_id
    let telegramId = payload.telegramId;

    if (!telegramId && payload.userId) {
      const { data: user } = await db
        .from("users")
        .select(
          "telegram_id, role, notification_order_status, notification_new_products, notification_promotions"
        )
        .eq("id", payload.userId)
        .single();

      if (!user) {
        console.error("User not found for notification:", payload.userId);
        return false;
      }

      telegramId = user.telegram_id;

      // Проверяем настройки уведомлений
      if (!shouldSendNotification(user, payload.type)) {
        return false;
      }
    }

    if (!telegramId) {
      console.error("No telegram_id for notification");
      return false;
    }

    // Сохраняем в БД
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

    // Определяем какой бот отправляет
    const bot = getBotForNotificationType(payload.type);

    // Отправляем сообщение
    await bot.api.sendMessage(telegramId, payload.message, {
      parse_mode: "HTML",
    });

    return true;
  } catch (error) {
    console.error("Error sending notification:", error);
    return false;
  }
}

/**
 * Проверяет, нужно ли отправлять уведомление пользователю
 */
function shouldSendNotification(
  user: {
    notification_order_status: boolean | null;
    notification_new_products: boolean | null;
    notification_promotions: boolean | null;
  },
  type: NotificationType
): boolean {
  // Эти уведомления отправляются всегда
  const alwaysSend: NotificationType[] = [
    "return_code_needed",
    "level_up",
    "subscription_expiring",
    "subscription_expired",
    "return_arrived",
  ];

  if (alwaysSend.includes(type)) {
    return true;
  }

  // Проверяем настройки
  if (["order_paid", "order_shipped", "order_completed", "order_overdue"].includes(type)) {
    return user.notification_order_status !== false;
  }

  if (["new_product", "product_available"].includes(type)) {
    return user.notification_new_products !== false;
  }

  return true;
}

/**
 * Определяет какой бот должен отправить уведомление
 */
function getBotForNotificationType(type: NotificationType): Bot {
  const shipperTypes: NotificationType[] = ["new_orders", "urgent_orders", "returns_ready"];

  const ownerTypes: NotificationType[] = [
    "new_order",
    "order_problem",
    "new_subscription",
    "vibe_debt",
    "vibe_limit_reached",
    "product_low_stock",
    "order_not_shipped",
    "daily_summary",
  ];

  if (shipperTypes.includes(type)) {
    return getShipperBotForNotifications();
  }

  if (ownerTypes.includes(type)) {
    return getOwnerBotForNotifications();
  }

  return getClientBotForNotifications();
}

// ============================================
// Готовые функции для типовых уведомлений
// ============================================

/**
 * Уведомление клиента об отправке заказа
 */
export async function notifyOrderShipped(params: {
  userId: string;
  orderNumber: number;
  trackingNumber: string;
  deliveryService: string;
}) {
  return sendNotification({
    userId: params.userId,
    type: "order_shipped",
    title: "Заказ отправлен",
    message:
      `📦 Ваш заказ #${params.orderNumber} отправлен!\n\n` +
      `Трек: <code>${params.trackingNumber}</code>\n` +
      `Служба: ${formatDeliveryService(params.deliveryService)}`,
    data: params,
  });
}

/**
 * Уведомление о завершении заказа
 */
export async function notifyOrderCompleted(params: { userId: string; orderNumber: number }) {
  return sendNotification({
    userId: params.userId,
    type: "order_completed",
    title: "Заказ завершён",
    message: `🎉 Заказ #${params.orderNumber} доставлен!`,
    data: params,
  });
}

/**
 * Уведомление о прибытии возврата
 */
export async function notifyReturnArrived(params: {
  userId: string;
  orderNumber: number;
  pickupAddress: string;
}) {
  return sendNotification({
    userId: params.userId,
    type: "return_arrived",
    title: "Возврат прибыл",
    message:
      `📥 Возврат заказа #${params.orderNumber} прибыл.\n\n` +
      `Адрес получения:\n${params.pickupAddress}\n\n` +
      `⚠️ Укажите код возврата на сайте, чтобы мы забрали товар.`,
    data: params,
  });
}

/**
 * Уведомление о повышении уровня
 */
export async function notifyLevelUp(params: {
  userId: string;
  newLevel: number;
  newDiscount: number;
}) {
  return sendNotification({
    userId: params.userId,
    type: "level_up",
    title: "Новый уровень",
    message:
      `🎉 Поздравляем! Вы достигли уровня ${params.newLevel}!\n\n` +
      `Теперь ваша скидка: ${params.newDiscount}%`,
    data: params,
  });
}

/**
 * Уведомление о новом поступлении
 */
export async function notifyNewProduct(params: {
  userId: string;
  productName: string;
  productBrand: string;
}) {
  return sendNotification({
    userId: params.userId,
    type: "new_product",
    title: "Новое поступление",
    message: `📦 Новое поступление!\n${params.productBrand} ${params.productName} уже в наличии.`,
    data: params,
  });
}

/**
 * Уведомление о скором истечении подписки
 */
export async function notifySubscriptionExpiring(params: {
  userId: string;
  daysLeft: number;
  tier: string;
}) {
  return sendNotification({
    userId: params.userId,
    type: "subscription_expiring",
    title: "Подписка истекает",
    message:
      `⏰ Ваша подписка ${SUBSCRIPTION_LABELS[params.tier]} истекает через ${params.daysLeft} дн.\n\n` +
      `Продлите, чтобы не потерять доступ.`,
    data: params,
  });
}

// ============================================
// Уведомления для отправщиков
// ============================================

/**
 * Уведомление о новых заказах
 */
export async function notifyNewOrders(params: { shipperId: string; count: number }) {
  return sendNotification({
    userId: params.shipperId,
    type: "new_orders",
    title: "Новые заказы",
    message: `🔔 Новые заказы для сборки: ${params.count}`,
    data: params,
  });
}

/**
 * Уведомление о срочных заказах
 */
export async function notifyUrgentOrders(params: {
  shipperId: string;
  orders: Array<{ orderNumber: number; productName: string; size: string }>;
}) {
  let message = `⚠️ Срочно! ${params.orders.length} заказа(ов) сгорают сегодня:\n\n`;

  params.orders.forEach((order) => {
    message += `#${order.orderNumber} — ${order.productName}, ${order.size}\n`;
  });

  return sendNotification({
    userId: params.shipperId,
    type: "urgent_orders",
    title: "Срочные заказы",
    message,
    data: params,
  });
}

// ============================================
// Уведомления для владельца
// ============================================

const OWNER_TELEGRAM_ID = parseInt(process.env.OWNER_TELEGRAM_ID || "0");

/**
 * Уведомление владельца о новом заказе
 */
export async function notifyOwnerNewOrder(params: {
  orderNumber: number;
  productName: string;
  size: string;
  clientUsername: string;
  price: number;
  isPremium?: boolean;
}) {
  const emoji = params.isPremium ? "⭐" : "📦";
  const premiumLabel = params.isPremium ? "\n🔒 Premium позиция" : "";

  return sendNotification({
    telegramId: OWNER_TELEGRAM_ID,
    type: "new_order",
    title: "Новый заказ",
    message:
      `${emoji} Заказ: ${params.orderNumber}\n` +
      `${params.productName}${premiumLabel}\n` +
      `Размер: ${params.size}\n` +
      `${formatPrice(params.price)}\n` +
      `Заказ от @${params.clientUsername}`,
    data: params,
  });
}

/**
 * Уведомление о новой подписке
 */
export async function notifyOwnerNewSubscription(params: {
  clientUsername: string;
  tier: string;
  price: number;
}) {
  return sendNotification({
    telegramId: OWNER_TELEGRAM_ID,
    type: "new_subscription",
    title: "Новая подписка",
    message:
      `💳 Новая подписка!\n` +
      `@${params.clientUsername} оплатил ${SUBSCRIPTION_LABELS[params.tier]} (${formatPrice(params.price)})`,
    data: params,
  });
}

/**
 * Вечерняя сводка для владельца
 */
export async function notifyOwnerDailySummary(params: {
  date: string;
  orders: number;
  revenue: number;
  profit: number;
  newClients: number;
  urgentOrders: number;
  vibeDebtors: Array<{ username: string; debt: number }>;
  lowStockProducts: Array<{ name: string; remaining: number }>;
}) {
  let message =
    `📊 Вечерняя сводка (${params.date}):\n\n` +
    `Заказов: ${params.orders}\n` +
    `Выручка: ${formatPrice(params.revenue)}\n` +
    `Прибыль: ${formatPrice(params.profit)}\n` +
    `Новых клиентов: ${params.newClients}\n`;

  // Предупреждения
  const warnings: string[] = [];

  if (params.urgentOrders > 0) {
    warnings.push(`• ${params.urgentOrders} заказа(ов) сгорают завтра`);
  }

  params.vibeDebtors.forEach((debtor) => {
    warnings.push(`• @${debtor.username} должен ${formatPrice(Math.abs(debtor.debt))}`);
  });

  params.lowStockProducts.forEach((product) => {
    warnings.push(`• ${product.name}: осталось ${product.remaining} шт.`);
  });

  if (warnings.length > 0) {
    message += `\n⚠️ Требует внимания:\n${warnings.join("\n")}`;
  }

  return sendNotification({
    telegramId: OWNER_TELEGRAM_ID,
    type: "daily_summary",
    title: "Вечерняя сводка",
    message,
    data: params,
  });
}

/**
 * Отправка в группу заказов (в топик "Заказы")
 */
export async function sendToOrdersGroup(params: {
  orderNumber: number;
  productName: string;
  size: string;
  deliveryService: string;
  clientUsername: string;
  isPremium?: boolean;
}) {
  const groupId = process.env.TELEGRAM_ORDERS_GROUP_ID;
  if (!groupId) return false;

  const threadId = process.env.TELEGRAM_ORDERS_THREAD_ID;

  try {
    const bot = getClientBotForNotifications();
    const emoji = params.isPremium ? "⭐" : "📦";

    let message =
      `${emoji} Заказ: ${params.orderNumber}\n` +
      `${params.productName}\n` +
      `Размер: ${params.size}\n` +
      `${formatDeliveryService(params.deliveryService)}\n` +
      `Заказ от @${params.clientUsername}`;

    if (params.isPremium) {
      message = `${emoji} Заказ: ${params.orderNumber}\n🔒 Premium позиция\nЗаказ от @${params.clientUsername}`;
    }

    await bot.api.sendMessage(groupId, message, {
      message_thread_id: threadId ? parseInt(threadId) : undefined,
    });
    return true;
  } catch (error) {
    console.error("Error sending to orders group:", error);
    return false;
  }
}

/**
 * Уведомление владельца о проблеме с заказом (отправщик зафиксировал проблему)
 */
export async function notifyOwnerOrderProblem(params: {
  orderNumber: number;
  problemType: string;
}) {
  const labels: Record<string, string> = {
    out_of_stock: "Нет в наличии",
    bad_barcode: "Штрихкод не работает",
  };

  return sendNotification({
    telegramId: OWNER_TELEGRAM_ID,
    type: "order_problem",
    title: "Проблема с заказом",
    message: `⚠️ Проблема с заказом #${params.orderNumber}: ${labels[params.problemType] || params.problemType}`,
    data: params,
  });
}
