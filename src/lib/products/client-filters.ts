/**
 * Единый helper фильтрации товаров для клиентских endpoints.
 *
 * Используется в:
 * - /api/products (каталог)
 * - /api/products/[id] (деталь товара)
 * - /api/client/sellers/[id] (витрина)
 * - /api/products/filters (счётчики категорий/размеров)
 *
 * Централизует четыре правила:
 * 1. Только активные (is_active = true)
 * 2. Не soft-deleted (deleted_at IS NULL)
 * 3. Премиум-gate: не-premium клиент не видит is_premium=true товары
 * 4. Stock-gate: не-premium клиент не видит "в пути" товары
 */

export type ClientProductAvailability = "available" | "all";

export interface ClientProductFilterOpts {
  isPremium: boolean;
  /**
   * 'available' — только is_in_stock=true (заказать можно прямо сейчас).
   * 'all' — включая "в пути" (is_in_stock=false). Только для premium.
   * Non-premium клиент всегда forced to 'available'.
   */
  availability?: ClientProductAvailability;
  /** Ограничить выдачу товарами конкретного селлера */
  sellerId?: string;
}

/**
 * Применяет стандартные клиентские фильтры к Supabase-запросу на products.
 *
 * @example
 *   let query = supabase.from("products").select("*");
 *   query = applyClientProductFilters(query, { isPremium, availability: 'available' });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyClientProductFilters<T extends Record<string, any>>(
  query: T,
  opts: ClientProductFilterOpts
): T {
  let q = query.eq("is_active", true).is("deleted_at", null);
  if (opts.sellerId) q = q.eq("seller_id", opts.sellerId);
  if (!opts.isPremium) q = q.eq("is_premium", false);
  // Non-premium всегда только available, premium — по явному флагу
  if (opts.availability === "available" || !opts.isPremium) {
    q = q.eq("is_in_stock", true);
  }
  return q;
}

/**
 * Маппинг URL-параметра `inStock` (`"true" | "false" | undefined`) в availability.
 *
 * Правила:
 * - inStock="true" → "available"
 * - inStock="false" + premium → "all" (явный opt-in увидеть "в пути")
 * - inStock="false" + non-premium → "available" (non-premium не имеет права)
 * - inStock=undefined + non-premium → "available"
 * - inStock=undefined + premium → "all" (дефолт premium — всё)
 */
export function resolveAvailability(
  inStockParam: string | undefined,
  isPremium: boolean
): ClientProductAvailability {
  if (!isPremium) return "available";
  if (inStockParam === "true") return "available";
  if (inStockParam === "false") return "all";
  return "all";
}
