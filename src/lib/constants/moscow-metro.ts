/**
 * Коричневое кольцо Москвы — Кольцевая линия (линия 5).
 * При автопостинге адрес объявления = случайная станция кольца
 * (так делают почти все продавцы — выглядит «живо», без точного адреса).
 */
export const MOSCOW_RING_METRO = [
  "Киевская",
  "Краснопресненская",
  "Белорусская",
  "Новослободская",
  "Проспект Мира",
  "Комсомольская",
  "Курская",
  "Таганская",
  "Павелецкая",
  "Добрынинская",
  "Октябрьская",
  "Парк культуры",
] as const;

export type MoscowRingMetro = (typeof MOSCOW_RING_METRO)[number];

/** Случайная станция коричневого кольца. */
export function randomRingMetro(): MoscowRingMetro {
  return MOSCOW_RING_METRO[Math.floor(Math.random() * MOSCOW_RING_METRO.length)];
}
