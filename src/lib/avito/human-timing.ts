/**
 * Естественные задержки и расписание для Avito синхронизации.
 *
 * Имитирует поведение реального пользователя:
 * - Случайные интервалы вместо фиксированных
 * - Учёт времени суток (ночью реже, днём чаще)
 * - Jitter (±30% от базового интервала)
 * - Стаггеринг сессий (каждая сессия синхронизируется независимо)
 */

import { randomInt } from "crypto";

// =====================================================
// Время суток (Moscow UTC+3)
// =====================================================

type TimePeriod = "night" | "morning" | "day" | "evening";

/** Возвращает текущий период суток по Москве */
export function getMoscowTimePeriod(): TimePeriod {
  const moscowHour = getMoscowHour();

  if (moscowHour >= 1 && moscowHour < 7) return "night";
  if (moscowHour >= 7 && moscowHour < 10) return "morning";
  if (moscowHour >= 10 && moscowHour < 22) return "day";
  return "evening";
}

export function getMoscowHour(): number {
  const now = new Date();
  const moscowTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return moscowTime.getUTCHours();
}

// =====================================================
// Множители частоты по времени суток
// =====================================================

/**
 * Множитель интервала по времени суток.
 * > 1 = реже (ночью), < 1 = чаще (не используем, чтобы не превышать rate limits)
 *
 * Ночью (1:00–7:00): синхронизация в 3-4 раза реже — человек спит
 * Утро (7:00–10:00): постепенное увеличение частоты
 * День (10:00–22:00): базовая частота (×1)
 * Вечер (22:00–1:00): немного реже
 */
const INTERVAL_MULTIPLIERS: Record<TimePeriod, [number, number]> = {
  night: [3.0, 4.0],
  morning: [1.2, 1.8],
  day: [0.8, 1.2],
  evening: [1.0, 1.5],
};

// =====================================================
// Основные функции
// =====================================================

/**
 * Добавляет jitter к интервалу.
 * @param baseMs - базовый интервал в мс
 * @param jitterPct - процент отклонения (0.3 = ±30%)
 * @returns случайный интервал в диапазоне [base * (1 - jitter), base * (1 + jitter)]
 */
export function withJitter(baseMs: number, jitterPct: number = 0.3): number {
  const min = Math.round(baseMs * (1 - jitterPct));
  const max = Math.round(baseMs * (1 + jitterPct));
  return randomInt(Math.max(min, 1000), max + 1);
}

/**
 * Возвращает интервал для следующей синхронизации с учётом времени суток.
 * @param baseIntervalMs - базовый интервал (например, 15 мин)
 * @returns интервал в мс с jitter и time-of-day множителем
 */
export function getNextSyncInterval(baseIntervalMs: number): number {
  const period = getMoscowTimePeriod();
  const [minMult, maxMult] = INTERVAL_MULTIPLIERS[period];

  // Случайный множитель в диапазоне
  const multiplier = minMult + Math.random() * (maxMult - minMult);
  const adjusted = Math.round(baseIntervalMs * multiplier);

  // Добавляем jitter ±20%
  return withJitter(adjusted, 0.2);
}

/**
 * Случайная задержка в диапазоне [min, max] мс.
 * Используется для пауз между API-вызовами.
 */
export function humanDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = randomInt(minMs, maxMs + 1);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Задержка между сессиями при batch-синхронизации.
 * Рандомная от 8 до 25 сек — не фиксированная.
 */
export function getSessionStaggerDelay(): number {
  return randomInt(8_000, 25_001);
}

/**
 * Задержка между страницами при запросе items.
 * 1.5-4 сек — как если бы человек листал страницу.
 */
export function getPageDelay(): number {
  return randomInt(1_500, 4_001);
}

/**
 * Задержка перед первым запросом в sync цикле.
 * Имитирует "открытие приложения" — 2-6 сек.
 */
export function getWarmupDelay(): number {
  return randomInt(2_000, 6_001);
}

/**
 * Должна ли сессия пропустить текущий цикл синхронизации.
 *
 * Ночью (1:00–7:00 МСК): 60% шанс пропустить
 * Утро/вечер: 15% шанс пропустить
 * День: 5% шанс пропустить (редко — имитация "отвлёкся")
 *
 * Это создаёт естественную нерегулярность — не все сессии
 * синхронизируются каждый цикл.
 */
export function shouldSkipSync(): boolean {
  const period = getMoscowTimePeriod();
  const skipChance: Record<TimePeriod, number> = {
    night: 0.6,
    morning: 0.15,
    day: 0.05,
    evening: 0.15,
  };

  return Math.random() < skipChance[period];
}

/**
 * Перемешивает массив (Fisher-Yates).
 * Используется для рандомного порядка обработки сессий.
 */
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
