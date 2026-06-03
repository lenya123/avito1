/**
 * Эвристики обогащения заказов Avito Доставки (ТЗ: по какой объяве,
 * код возврата). Web-эндпоинт не отдаёт это явно — связываем как можем.
 *
 * // STUB: owner-panel — в боевой панели есть точные id объявления и коды
 * возврата; здесь приближение по заголовку/тексту.
 */
import { classifyAvitoOrder } from "./order-status";

/** Нормализация заголовка для матчинга объявления. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-zа-яё0-9 ]/gi, "")
    .trim();
}

/**
 * Сопоставить заказ с объявлением по заголовку.
 * @param itemTitle заголовок из заказа (imgSet[0].alt)
 * @param items список объявлений сессии [{avito_item_id, title}]
 */
export function linkOrderToItem(
  itemTitle: string | null | undefined,
  items: Array<{ avito_item_id: string | number; title: string | null }>
): string | null {
  if (!itemTitle) return null;
  const t = norm(itemTitle);
  if (!t) return null;
  // 1) точное совпадение
  const exact = items.find((i) => i.title && norm(i.title) === t);
  if (exact) return String(exact.avito_item_id);
  // 2) вхождение (заголовок объявления содержит/входит в заголовок заказа)
  const part = items.find((i) => {
    if (!i.title) return false;
    const it = norm(i.title);
    return it.length > 6 && (t.includes(it) || it.includes(t));
  });
  return part ? String(part.avito_item_id) : null;
}

/**
 * Извлечь код возврата (если заказ — возврат). Эвристика по info/label/status:
 * Avito показывает код выдачи возврата строкой/числом.
 */
export function extractReturnCode(
  status: string | null | undefined,
  statusLabel: string | null | undefined,
  info: string | null | undefined
): string | null {
  const cat = classifyAvitoOrder(status, statusLabel);
  if (cat !== "return_active" && cat !== "return_completed") return null;
  const hay = `${info ?? ""} ${statusLabel ?? ""}`;
  // код вида «1234» / «код: 1234» / «код возврата 12 34»
  const m = hay.match(/код[^0-9]{0,12}(\d[\d\s-]{2,8}\d)/i) || hay.match(/\b(\d{4,8})\b/);
  return m ? m[1].replace(/[\s-]/g, "") : null;
}
