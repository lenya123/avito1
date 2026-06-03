/**
 * Единая формула агрегата недостач из stock_reconciliations.
 *
 * Один источник правды для всех трёх мест чтения: список «Товары»,
 * страница товара, Аналитика. Раньше формула была скопирована в 3 файла —
 * одну копию ограничили лимитом 50, две нет → расхождение суммы. Канон
 * §11.4: delta>0 = недостача, delta<0 = излишек, ₽ по снимку закупочной.
 */

export interface LossAggregate {
  /** Потеряно единиц — Σ положительных delta. */
  units: number;
  /** Потеря в ₽ по снимку закупочной — Σ(delta × pp) для delta>0. НЕ округлено. */
  rub: number;
  /** Излишек единиц — Σ |отрицательных delta|. */
  surplus: number;
}

export interface LossRow {
  delta: number;
  purchase_price_snapshot: number | string | null;
}

function emptyAggregate(): LossAggregate {
  return { units: 0, rub: 0, surplus: 0 };
}

function applyRow(acc: LossAggregate, r: LossRow): void {
  if (r.delta > 0) {
    acc.units += r.delta;
    acc.rub += r.delta * (Number(r.purchase_price_snapshot) || 0);
  } else if (r.delta < 0) {
    acc.surplus += -r.delta;
  }
}

/** Агрегат недостач по одному товару (все его строки сверок). */
export function aggregateLoss(rows: readonly LossRow[]): LossAggregate {
  const acc = emptyAggregate();
  for (const r of rows) applyRow(acc, r);
  return acc;
}

/** Агрегат недостач, сгруппированный по product_id (список / Аналитика). */
export function aggregateLossByProduct<T extends LossRow & { product_id: string | null }>(
  rows: readonly T[]
): Map<string, LossAggregate> {
  const byProduct = new Map<string, LossAggregate>();
  for (const r of rows) {
    if (!r.product_id) continue;
    let acc = byProduct.get(r.product_id);
    if (!acc) {
      acc = emptyAggregate();
      byProduct.set(r.product_id, acc);
    }
    applyRow(acc, r);
  }
  return byProduct;
}
