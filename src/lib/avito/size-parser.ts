/**
 * Парсер ответа покупателя на запрос размера (ТЗ Авито-заказы §4.2 п.4).
 *
 * Минимальная версия — regex/словарь по доступным размерам товара.
 * Не использует LLM (полноценный AI владелец доделает позже).
 *
 * Логика:
 *   1. Нормализуем текст: lowercase, убираем лишнее.
 *   2. Для каждого доступного размера проверяем словарь синонимов.
 *   3. Если матч единственный — возвращаем его.
 *   4. Если матчей несколько (написал «м или л») или ноль — null.
 */

const SIZE_SYNONYMS: Record<string, readonly string[]> = {
  XXS: ["xxs", "икс икс эс", "икс-икс-эс"],
  XS: ["xs", "икс эс", "икс-эс", "икс-с", "иксес"],
  S: ["s", "эс", "es"],
  M: ["m", "эм", "эмка", "м-ка", "м ка"],
  L: ["l", "эл", "эль", "элка", "л-ка", "л ка"],
  XL: ["xl", "икс эл", "икс-эл", "иксэл", "иксел", "большой", "большая"],
  XXL: ["xxl", "икс икс эл", "икс-икс-эл", "очень большой", "очень большая"],
  XXXL: ["xxxl", "икс икс икс эл", "огромный", "огромная"],
};

/**
 * Пытается распарсить размер из текста покупателя.
 *
 * @param text         Сырой текст сообщения.
 * @param availableSizes Список размеров, которые сейчас в наличии у товара
 *                       (например ["S", "M", "L"]). Парсер вернёт размер
 *                       ТОЛЬКО если он в этом списке (иначе перезапросим).
 * @returns Распознанный размер или null.
 */
export function parseAvitoSizeReply(
  text: string,
  availableSizes: readonly string[]
): string | null {
  if (!text || availableSizes.length === 0) return null;

  // Нормализация: убираем пунктуацию, нижний регистр, нормализуем пробелы.
  // Кириллица + латиница + цифры + пробел/дефис; всё прочее — на пробел.
  const normalized = text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Проверяем числовые размеры (42, 44, 46, 48...) — частый паттерн в одежде/обуви.
  const numericMatch = normalized.match(/\b(\d{2,3})\b/);
  if (numericMatch) {
    const n = numericMatch[1];
    const hit = availableSizes.find((s) => s === n);
    if (hit) return hit;
  }

  // Считаем матчи по словарю синонимов для каждого доступного буквенного размера.
  const matched: string[] = [];
  for (const size of availableSizes) {
    const upper = size.toUpperCase();
    const syns = SIZE_SYNONYMS[upper];
    if (!syns) continue;
    const found = syns.some((syn) => containsAsToken(normalized, syn));
    if (found) matched.push(size);
  }

  // Уникальный матч.
  if (matched.length === 1) return matched[0];
  return null;
}

/**
 * Проверка вхождения «как отдельного токена/фразы» — чтобы не матчить
 * «м» внутри «можно» или «эс» внутри «спасибо».
 */
function containsAsToken(haystack: string, needle: string): boolean {
  if (!needle) return false;
  // Многословные синонимы — просто substring (они достаточно специфичны).
  if (needle.includes(" ") || needle.includes("-")) return haystack.includes(needle);
  // Однословные — границы по не-буквенно-цифровым символам (ASCII + кириллица).
  const re = new RegExp(`(^|[^a-zа-яё0-9])${escapeRegex(needle)}([^a-zа-яё0-9]|$)`, "i");
  return re.test(haystack);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
