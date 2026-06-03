/**
 * Рендеринг шаблона реквизитов из `business_settings.payment_requisites_message`.
 *
 * Плейсхолдеры: {{amount}}, {{order_numbers}}, {{card_label}}, {{deadline}},
 * {{card_number}}, {{bank}}, {{holder}}, {{sbp_phone}}. Все — опциональные;
 * если плейсхолдер не заменён в шаблоне — оставляем пустую строку.
 */

import { formatPrice } from "./formatters";

export interface RequisitesVars {
  amount: number;
  orderNumbers: number[];
  cardLabel?: string | null;
  cardNumber?: string | null;
  bank?: string | null;
  holder?: string | null;
  sbpPhone?: string | null;
  deadline?: string | null;
}

const DEFAULT_TEMPLATE =
  "Сумма к оплате: <b>{{amount}}</b>\n" +
  "Заказ(ы): №{{order_numbers}}\n\n" +
  "Карта: <b>{{card_number}}</b>\n" +
  "Банк: {{bank}}\n" +
  "Получатель: {{holder}}\n" +
  "{{sbp_phone}}\n\n" +
  "После оплаты пришлите фото чека одним сообщением.";

export function renderRequisites(
  template: string | null | undefined,
  vars: RequisitesVars
): string {
  const tpl = template && template.trim().length > 0 ? template : DEFAULT_TEMPLATE;

  const replacements: Record<string, string> = {
    amount: formatPrice(vars.amount),
    order_numbers: vars.orderNumbers.join(", №"),
    card_label: vars.cardLabel ?? "",
    card_number: vars.cardNumber ?? "",
    bank: vars.bank ?? "",
    holder: vars.holder ?? "",
    sbp_phone: vars.sbpPhone ? `СБП: ${vars.sbpPhone}` : "",
    deadline: vars.deadline ?? "",
  };

  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => replacements[key] ?? "");
}
