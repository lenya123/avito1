const formatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

/**
 * Форматирует сумму в рублях по ru-RU локали. null/undefined → «—».
 * Используется на финансовых страницах для консистентности. Остальные места
 * могут продолжать использовать .toLocaleString() — этот хелпер не обязателен.
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${formatter.format(value)} ₽`;
}

/**
 * Форматирует сумму со знаком (`+`/`−`). Для ledger-записей.
 */
export function formatCurrencySigned(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatter.format(Math.abs(value))} ₽`;
}
