/**
 * Telegram Bots Library
 *
 * После пивота на B2B SaaS остались owner/shipper боты и уведомления.
 * Customer-bot (для клиентов оптовика) появится в Этапе 3 отдельным модулем.
 */

// Боты
export { createShipperBot, getShipperBot, shipperBot } from "./bots/shipper-bot";
export { createOwnerBot, getOwnerBot, ownerBot } from "./bots/owner-bot";
export {
  createCustomerBot,
  getCustomerBot,
  customerBot,
  type CustomerContext,
  type CustomerSessionData,
} from "./bots/customer-bot";
export {
  createPartnerBot,
  getPartnerBot,
  partnerBot,
  type PartnerContext,
  type PartnerSessionData,
} from "./bots/partner-bot";

// Уведомления
export {
  sendNotification,
  notifyShippersOrderUrgent,
  notifyShipperPayoutPaid,
  notifyShipperOrderResumed,
  notifyOwnerReceiptReceived,
  notifyOwnerStockMismatch,
  notifyOwnerDailySummary,
  notifyOwnerSecurityAlert,
  notifyCustomerOrderApproved,
  notifyCustomerPaymentRejected,
  notifyCustomerOrderShipped,
  notifyCustomerOrderArrived,
  notifyCustomerOrderCancelled,
  notifyCustomerVibeFrozen,
  notifyCustomerVibeUnfrozen,
  notifyCustomerVibePaymentConfirmed,
  notifyCustomerVibePaymentNeedsReview,
  sendToPartner,
  sendReceiptPhotoToPartner,
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
  escapeHtml,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_EMOJI,
  DELIVERY_SERVICE_LABELS,
} from "./utils/formatters";

export {
  KEYBOARDS,
  createInlineKeyboard,
  createNotificationSettingsKeyboard,
  createOrdersKeyboard,
  createConfirmKeyboard,
} from "./utils/keyboards";

export { CUSTOMER_KEYBOARDS, customerMainMenu } from "./utils/customer-keyboards";

// База данных
export { getBotDb, findUserByTelegramId, findCustomerByTelegramId, createCustomer } from "./db";
