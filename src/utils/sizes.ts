/**
 * Единый порядок размеров для отображения ВЕЗДE в проекте: от меньшего
 * к большему. Надёжный компаратор (не фиксированный список):
 *   1) буквенные размеры в каноническом порядке XXS→5XL;
 *   2) числовые размеры — по числовому значению (43 > 41, не «строкой»);
 *   3) прочие неизвестные — по алфавиту;
 *   4) «One Size» — всегда последним (регистр не важен).
 */

// Буквенные размеры → ранг. Алиасы (2XL=XXL и т.д.) ведут на тот же ранг.
const LETTER_RANK: Record<string, number> = {
  XXS: 0,
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  XXL: 6,
  "2XL": 6,
  XXXL: 7,
  "3XL": 7,
  XXXXL: 8,
  "4XL": 8,
  XXXXXL: 9,
  "5XL": 9,
};

function isOneSize(s: string): boolean {
  const n = s.replace(/[\s_-]/g, "").toUpperCase();
  return n === "ONESIZE" || n === "OS";
}

/**
 * Группа (порядок между типами) + ранг (внутри группы) + sub
 * (вторичный ключ, напр. цифра у джинс «M (31)»).
 * Группы: 0 буквы · 1 числа · 2 прочее · 3 One Size (всегда в конце).
 */
function classify(raw: string): { group: number; rank: number; sub: number; text: string } {
  const s = (raw ?? "").trim();
  const up = s.toUpperCase();
  if (isOneSize(s)) return { group: 3, rank: 0, sub: 0, text: up };
  if (up in LETTER_RANK) return { group: 0, rank: LETTER_RANK[up], sub: 0, text: up };
  if (/^\d+([.,]\d+)?$/.test(s))
    return { group: 1, rank: parseFloat(s.replace(",", ".")), sub: 0, text: up };
  // Джинсы «БУКВА (цифра)»: сортируем по букве, цифра — вторичный ключ.
  const jeans = s.match(/^(.+?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*\)\s*$/);
  if (jeans) {
    const lu = jeans[1].trim().toUpperCase();
    if (lu in LETTER_RANK)
      return {
        group: 0,
        rank: LETTER_RANK[lu],
        sub: parseFloat(jeans[2].replace(",", ".")),
        text: up,
      };
  }
  return { group: 2, rank: 0, sub: 0, text: up };
}

/** Сравнение двух размеров: от меньшего к большему. */
export function compareSizes(a: string, b: string): number {
  const ca = classify(a);
  const cb = classify(b);
  if (ca.group !== cb.group) return ca.group - cb.group;
  if (ca.group === 2) return ca.text.localeCompare(cb.text); // прочее — по алфавиту
  if (ca.rank !== cb.rank) return ca.rank - cb.rank;
  if (ca.sub !== cb.sub) return ca.sub - cb.sub;
  return ca.text.localeCompare(cb.text);
}

/** Сортировка массива строк-размеров по возрастанию. */
export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort(compareSizes);
}

/** Сортировка массива объектов с полем `size` по возрастанию. */
export function sortSizeEntries<T extends { size: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => compareSizes(a.size, b.size));
}
