/**
 * Единый расчёт выручки/себестоимости/прибыли владельца по заказу.
 * ОДИН источник правды для всех экранов (страница товара, Аналитика,
 * Финансы, Дашборд) — раньше каждый считал по-своему (разнобой).
 *
 * Канон §9.3 (выручка по статусам) + §9.4 (партнёрский = комиссия,
 * свой = client_price − purchase_price − shipper_rate_snapshot).
 *
 * Часть C (вычет ставки отправщика) разблокирована 2026-05-18 — модель
 * выплат решена (2 режима, §9.5/9.6). `shipper_rate_snapshot` пишется
 * в orders при переходе в `sent` триггером `orders_snapshot_shipper_rate`
 * (ставка «на сейчас» по режиму: fixed → fixed_rate; pendulum → rate по
 * shipper_score). Свой заказ: ownerCost = purchase_price +
 * shipper_rate_snapshot. Партнёрский — без изменений (cost = 0).
 *
 * Примечание: для pendulum это снимок ставки НА МОМЕНТ отгрузки. Точный
 * заработок отправщика за день досчитывается ELO-джобой в 00:10 и живёт
 * в shipper_stats.earnings (операционный реестр выплат). Прибыль владельца
 * §9.4 — аналитическая оценка по at-ship снимку; допустимый небольшой
 * расхождение задокументировано в каноне.
 */
import { isRevenueCounted } from "@/lib/constants/pricing";

export interface OwnerRevenueOrder {
  status: string | null;
  /** §6.4: `return_done` + `bad_quality` = брак по вине клиента,
   *  деньги остались у владельца → считается в выручке (как trash). */
  fault_reason?: string | null;
  client_price: number | null;
  /** Нужны только для себестоимости (ownerCost). Revenue-only вызовы
   *  (напр. revenueByProduct) могут не тащить эти колонки. */
  purchase_price?: number | null;
  /** Снимок ставки отправщика на момент `sent` (§9.4). NULL до отгрузки
   *  / для партнёрского (в себестоимости партнёрского не участвует). */
  shipper_rate_snapshot?: number | null;
  partner_id: string | null;
  partner_commission_snapshot: number | null;
  /** Авито: комиссия Авито с продажи (§15 / ТЗ §6.1). NULL для дропа. */
  avito_fee_snapshot?: number | null;
  /** Авито: маркетинг на привлечение per-order (ТЗ §6.1, §6.3).
   *  NULL для дропа и при фоллбэке (когда API не отдаёт per-order). */
  avito_marketing_snapshot?: number | null;
}

/** Партнёрский заказ: деньги клиента идут партнёру напрямую,
 *  у владельца только комиссия (§9.4/§10.5). */
export function isPartnerOrder(o: { partner_id: string | null }): boolean {
  return o.partner_id != null;
}

/** Учитывается ли заказ в выручке с учётом §6.4 (bad_quality). */
function counted(o: OwnerRevenueOrder): boolean {
  return isRevenueCounted(o.status ?? "", o.fault_reason);
}

/** Выручка владельца по заказу (§9.3 + §9.4). 0 если не учитывается. */
export function ownerRevenue(o: OwnerRevenueOrder): number {
  if (!counted(o)) return 0;
  if (isPartnerOrder(o)) return o.partner_commission_snapshot ?? 0;
  return o.client_price ?? 0;
}

/** Себестоимость владельца по заказу (§9.4 + §15 Авито / ТЗ §6.1).
 *  Партнёрский → 0 (purchase_price/ставка не участвуют).
 *  Свой дроп → закупка + ставка отправщика (снимок на момент sent;
 *  до отгрузки snapshot = null).
 *  Свой Авито → дополнительно + комиссия Авито + маркетинг (per-order;
 *  если маркетинг не per-order, snapshot = NULL и в формулу не входит,
 *  учитывается на уровне периода — см. ТЗ §6.3). */
export function ownerCost(o: OwnerRevenueOrder): number {
  if (!counted(o)) return 0;
  if (isPartnerOrder(o)) return 0;
  return (
    (o.purchase_price ?? 0) +
    (o.shipper_rate_snapshot ?? 0) +
    (o.avito_fee_snapshot ?? 0) +
    (o.avito_marketing_snapshot ?? 0)
  );
}

/** Прибыль владельца по заказу = выручка − себестоимость
 *  (вкл. ставку отправщика по §9.4). */
export function ownerProfit(o: OwnerRevenueOrder): number {
  return ownerRevenue(o) - ownerCost(o);
}

/** Агрегат по массиву заказов. `count` — число учитываемых в выручке
 *  заказов (§9.3), для знаменателей средних (avg-чек/маржа). */
export function aggregateOwnerFinance(orders: readonly OwnerRevenueOrder[]): {
  revenue: number;
  cost: number;
  profit: number;
  count: number;
} {
  let revenue = 0;
  let cost = 0;
  let count = 0;
  for (const o of orders) {
    if (!counted(o)) continue;
    count += 1;
    revenue += ownerRevenue(o);
    cost += ownerCost(o);
  }
  return { revenue, cost, profit: revenue - cost, count };
}
