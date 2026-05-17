/**
 * Telegram Bots Library
 *
 * Экспортирует функции для работы с Telegram ботами:
 * - Инициализация ботов для webhook обработки
 * - Отправка уведомлений
 * - Утилиты форматирования
 */

// Боты
export { createClientBot, getClientBot, clientBot } from "./bots/client-bot";
export { createShipperBot, getShipperBot, shipperBot } from "./bots/shipper-bot";
export { createOwnerBot, getOwnerBot, ownerBot } from "./bots/owner-bot";

// Система уведомлений
export {
  sendNotification,
  notifyOrderShipped,
  notifyOrderCompleted,
  notifyReturnArrived,
  notifyLevelUp,
  notifyNewProduct,
  notifySubscriptionExpiring,
  notifyNewOrders,
  notifyUrgentOrders,
  notifyOwnerNewOrder,
  notifyOwnerNewSubscription,
  notifyOwnerDailySummary,
  sendToOrdersGroup,
  type NotificationPayload,
  type NotificationType,
} from "./notifications";

// Утилиты
export {
  formatPrice,
  formatDate,
  formatDateTime,
  formatOrderStatus,
  formatDeliveryService,
  formatLevel,
  getLevelDiscount,
  escapeHtml,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_EMOJI,
  DELIVERY_SERVICE_LABELS,
  SUBSCRIPTION_LABELS,
} from "./utils/formatters";

export {
  KEYBOARDS,
  createInlineKeyboard,
  createNotificationSettingsKeyboard,
  createOrdersKeyboard,
  createConfirmKeyboard,
} from "./utils/keyboards";

// База данных
export {
  getBotDb,
  findUserByTelegramId,
  createClientUser,
  regenerateSiteKey,
  updateNotificationSettings,
  getClientActiveOrders,
  getClientStats,
  authenticateShipper,
  getShipperStats,
  getOwnerDailyStats,
  findClientByUsername,
  toggleVibePlus,
} from "./db";
