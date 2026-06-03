/**
 * Единый КЛИЕНТСКИЙ справочник отображения статуса заказа (эмодзи +
 * человеческий лейбл). Источник правды для customer-bot: «Мои заказы»
 * и карточка в клиентской группе показывают ОДИН статус ОДИНАКОВО.
 *
 * Раньше было два расходящихся локальных map'а (orders-group.ts vs
 * my-orders.ts): для `paid/collecting/sent` клиент видел разные эмодзи
 * в ленте группы и в «Моих заказах» для одного и того же заказа.
 *
 * Намеренно отдельно от owner-справочника `@/lib/constants/order-status`
 * — у клиента другая аудитория и формулировки мягче (напр. `trash` =
 * «Возврат не успел», `problem` = «Ждём поступления товара», а не
 * внутренние «Утиль» / «Нет на складе»). Канон статусов §4.2.
 */
export const CUSTOMER_STATUS_EMOJI: Record<string, string> = {
  paid: "💳",
  collecting: "🔧",
  sent: "🚚",
  return: "↩️",
  return_done: "✔️",
  trash: "🗑",
  cancelled: "❌",
  problem: "⚠️",
};

export const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  paid: "Оплачен",
  collecting: "В сборке",
  sent: "Отправлен",
  return: "Возврат оформлен",
  return_done: "Возврат принят",
  trash: "Возврат не успел",
  cancelled: "Отменён",
  problem: "Ждём поступления товара",
};
