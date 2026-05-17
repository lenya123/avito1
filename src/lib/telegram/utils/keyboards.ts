import { InlineKeyboard, Keyboard } from "grammy";

/**
 * Готовые клавиатуры для ботов
 */

// ============================================
// Клавиатуры для бота клиентов
// ============================================

export const KEYBOARDS = {
  client: {
    main: new Keyboard()
      .text("📦 Мои заказы")
      .text("📊 Моя статистика")
      .row()
      .text("💳 Подписка")
      .text("🔑 Ключ от сайта")
      .row()
      .text("⚙️ Настройки")
      .text("💬 Поддержка")
      .resized(),

    settings: new Keyboard()
      .text("🔔 Уведомления")
      .text("👤 Профиль")
      .row()
      .text("↩️ Главное меню")
      .resized(),

    subscriptions: new InlineKeyboard()
      .text("📦 Basic — 500 ₽/мес", "sub:basic")
      .row()
      .text("⭐ Premium — 5 000 ₽/мес", "sub:premium")
      .row()
      .text("👑 Top Floor Boss — 15 000 ₽/мес", "sub:top_floor_boss"),
  },

  shipper: {
    main: new Keyboard()
      .text("📊 Моя статистика")
      .text("📱 Открыть приложение")
      .row()
      .text("⚙️ Настройки")
      .resized(),
  },

  owner: {
    main: new Keyboard()
      .text("📊 Статистика дня")
      .text("📦 Активные заказы")
      .row()
      .text("👥 Клиенты")
      .text("📈 Аналитика")
      .row()
      .text("⚙️ Настройки")
      .resized(),
  },

  back: new InlineKeyboard().text("↩️ Назад", "back"),
  backToMain: new InlineKeyboard().text("↩️ В главное меню", "main_menu"),
};

/**
 * Создаёт inline-клавиатуру из массива кнопок
 */
export function createInlineKeyboard(
  buttons: Array<{ text: string; callback_data?: string; url?: string }>,
  columns = 1
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  buttons.forEach((btn, index) => {
    if (btn.url) {
      keyboard.url(btn.text, btn.url);
    } else if (btn.callback_data) {
      keyboard.text(btn.text, btn.callback_data);
    }

    if ((index + 1) % columns === 0 && index < buttons.length - 1) {
      keyboard.row();
    }
  });

  return keyboard;
}

/**
 * Клавиатура настройки уведомлений
 */
export function createNotificationSettingsKeyboard(settings: {
  orderStatus: boolean;
  newProducts: boolean;
  promotions: boolean;
}): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${settings.orderStatus ? "✓" : "○"} Статус заказов`, "toggle:order_status")
    .row()
    .text(`${settings.newProducts ? "✓" : "○"} Новые поступления`, "toggle:new_products")
    .row()
    .text(`${settings.promotions ? "✓" : "○"} Акции и новости`, "toggle:promotions")
    .row()
    .text("💾 Сохранить", "save_settings")
    .text("↩️ Назад", "back");
}

/**
 * Клавиатура для списка заказов
 */
export function createOrdersKeyboard(hasMore: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (hasMore) {
    keyboard.text("📜 Показать ещё", "orders:more").row();
  }

  keyboard.text("📋 Завершённые", "orders:completed").row();
  keyboard.text("↩️ В главное меню", "main_menu");

  return keyboard;
}

/**
 * Клавиатура для подтверждения действия
 */
export function createConfirmKeyboard(confirmData: string, cancelData = "cancel"): InlineKeyboard {
  return new InlineKeyboard().text("✅ Да", confirmData).text("❌ Нет", cancelData);
}
