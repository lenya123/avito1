/**
 * Клавиатуры для customer-bot (клиентский бот оптовика).
 *
 * Главное меню статическое — оно показывается всегда, логика «+ВАЙБ ≠ обычный»
 * пока заглушена, будет дорабатываться в Phase 3.5 (добавится «💳 Оплатить долг»
 * для vibe-клиентов с долгом или заморозкой).
 */

import { InlineKeyboard, Keyboard } from "grammy";

export const CUSTOMER_KEYBOARDS = {
  main: new Keyboard()
    .text("📋 Каталог")
    .text("📦 Мои заказы")
    .row()
    .text("👤 Профиль")
    .text("🫂 Ассистент")
    .resized(),

  mainWithDebt: new Keyboard()
    .text("📋 Каталог")
    .text("📦 Мои заказы")
    .row()
    .text("💳 Оплатить долг")
    .row()
    .text("👤 Профиль")
    .text("🫂 Ассистент")
    .resized(),

  backToMain: new InlineKeyboard().text("↩️ В главное меню", "customer:main"),
};

/**
 * Выбирает клавиатуру главного меню в зависимости от состояния клиента.
 * vibeDebt === true → показываем «Оплатить долг».
 */
export function customerMainMenu(vibeDebt: boolean): Keyboard {
  return vibeDebt ? CUSTOMER_KEYBOARDS.mainWithDebt : CUSTOMER_KEYBOARDS.main;
}
