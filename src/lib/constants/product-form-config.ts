/**
 * Конфиг формы товара по категории (единый источник правды):
 *  - как выбираются размеры (sizeMode);
 *  - какой буквенный набор для letters/jeans;
 *  - какие поля замеров (пер-размер, в см; пусто = замеров нет).
 *
 * Канон §11.6. Используется и формой создания, и редактирования.
 */
import type { ProductCategory } from "./product-categories";

export type SizeMode = "letters" | "jeans" | "shoe" | "oneSize";

export interface CategoryFormConfig {
  /** letters — буквы тогглами; jeans — буквы + опц. цифра «M (31)»;
   *  shoe — свободный ввод чисел; oneSize — только «One Size». */
  sizeMode: SizeMode;
  /** Буквенный набор (для letters/jeans). */
  letterSizes: readonly string[];
  /** Предзаполнение по кнопке «Стандартные». */
  defaultLetters: readonly string[];
  /** Поля замеров пер-размер (в см). Пусто = секции замеров нет. */
  measurementFields: readonly string[];
}

export const ONE_SIZE = "One Size";

const LETTERS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;
const DEFAULT_LETTERS = ["S", "M", "L", "XL"] as const;

const M_TOP = ["Длина рукава", "Длина (плечо → низ)", "Ширина туловища"] as const;
const M_BOTTOM = ["Ширина талии", "Длина штанин", "Ширина выхода"] as const;

export const CATEGORY_FORM_CONFIG: Record<ProductCategory, CategoryFormConfig> = {
  "Верхняя одежда": {
    sizeMode: "letters",
    letterSizes: LETTERS,
    defaultLetters: DEFAULT_LETTERS,
    measurementFields: M_TOP,
  },
  "Нижняя одежда": {
    sizeMode: "jeans",
    letterSizes: LETTERS,
    defaultLetters: DEFAULT_LETTERS,
    measurementFields: M_BOTTOM,
  },
  Костюмы: {
    sizeMode: "letters",
    letterSizes: LETTERS,
    defaultLetters: DEFAULT_LETTERS,
    measurementFields: [...M_TOP, ...M_BOTTOM],
  },
  Аксессуары: {
    sizeMode: "oneSize",
    letterSizes: [],
    defaultLetters: [],
    measurementFields: [],
  },
  Обувь: {
    sizeMode: "shoe",
    letterSizes: [],
    defaultLetters: [],
    measurementFields: ["Длина стопы"],
  },
};

/** Конфиг по категории; null если категория не выбрана/неизвестна. */
export function formConfigFor(category: string | null | undefined): CategoryFormConfig | null {
  if (!category) return null;
  return CATEGORY_FORM_CONFIG[category as ProductCategory] ?? null;
}

/** Собрать строку-идентификатор размера для джинс: «M» или «M (31)». */
export function composeJeansSize(letter: string, num: string | number | null | undefined): string {
  const n = typeof num === "string" ? num.trim() : num;
  if (n === "" || n == null) return letter;
  return `${letter} (${n})`;
}

/** Разобрать «M (31)» → { letter:"M", num:"31" }; «M» → { letter:"M", num:"" }. */
export function parseJeansSize(size: string): { letter: string; num: string } {
  const m = size.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (m) return { letter: m[1].trim(), num: m[2].trim() };
  return { letter: size.trim(), num: "" };
}
