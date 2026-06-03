/**
 * Категории товаров — фиксированный список (единый источник правды).
 * Раньше был свободный текст + локальные расходящиеся массивы. Теперь
 * формы, фильтр, валидация и данные опираются только на это.
 *
 * НЕ путать с категориями расходов в Финансах (expense_categories) —
 * это отдельная сущность.
 */
export const PRODUCT_CATEGORIES = [
  "Верхняя одежда",
  "Нижняя одежда",
  "Костюмы",
  "Аксессуары",
  "Обувь",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export function isProductCategory(v: unknown): v is ProductCategory {
  return typeof v === "string" && (PRODUCT_CATEGORIES as readonly string[]).includes(v);
}
