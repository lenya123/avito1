/**
 * Финансовая математика после пивота на B2B SaaS (BUSINESS_LOGIC §9.4).
 *
 * Комиссия платформы (feePct) убрана — `computeNet` / `computeGrossForNet`
 * остались как generic-утилиты для любых пропорциональных расчётов.
 *
 * Прибыль владельца считается по двум формулам в зависимости от типа товара:
 *   Свой:        client_price − purchase_price − shipper_rate_snapshot
 *   Партнёрский: partner_commission_snapshot
 *                (деньги клиента идут партнёру напрямую — у нас только комиссия;
 *                 purchase_price и shipper_rate в партнёрском не участвуют.)
 */

export function computeNet(gross: number, feePct: number): number {
  return Math.round(gross * (1 - feePct / 100));
}

export function computeGrossForNet(net: number, feePct: number): number {
  return Math.ceil(net / (1 - feePct / 100));
}

/**
 * Прибыль владельца с конкретного заказа (BUSINESS_LOGIC §9.4).
 *
 * Передаём partner_commission_snapshot — если он не null, заказ партнёрский
 * и формула меняется (берём только комиссию). Все NULL-значения трактуем как 0.
 */
export function computeOwnerNet(args: {
  clientPrice: number | null | undefined;
  purchasePrice: number | null | undefined;
  shipperRateSnapshot: number | null | undefined;
  partnerCommissionSnapshot: number | null | undefined;
}): number {
  const partnerCommission = Number(args.partnerCommissionSnapshot ?? 0);
  if (partnerCommission > 0) {
    // Партнёрский заказ — у владельца только комиссия.
    return Math.round(partnerCommission);
  }
  const client = Number(args.clientPrice ?? 0);
  const purchase = Number(args.purchasePrice ?? 0);
  const shipper = Number(args.shipperRateSnapshot ?? 0);
  return Math.round(client - purchase - shipper);
}

/**
 * Учитывается ли заказ в выручке владельца (BUSINESS_LOGIC §9.3 + §15 Авито).
 *   Включает:  paid, collecting, sent, return, trash, problem
 *              + Авито-only: delivered (≈ sent, терминальный успех),
 *                            return_in_transit (≈ return, возврат в пути)
 *   Исключает: cancelled, return_done, awaiting_size (ещё не подтверждено)
 *
 * Исключение (§6.4): `return_done` с `fault_reason='bad_quality'` —
 * брак по вине клиента, авто-возврата денег НЕТ, деньги остаются у
 * владельца → СЧИТАЕТСЯ в выручке (как trash). Обычный `return_done`
 * (деньги возвращены) — НЕ считается.
 */
export function isRevenueCounted(status: string, faultReason?: string | null): boolean {
  if (status === "return_done") {
    return faultReason === "bad_quality";
  }
  return [
    "paid",
    "collecting",
    "sent",
    "return",
    "trash",
    "problem",
    "delivered",          // Avito: терминальный успех
    "return_in_transit",  // Avito: возврат в пути, деньги ещё у владельца
  ].includes(status);
}
