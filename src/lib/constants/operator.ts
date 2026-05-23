/**
 * Standalone-режим: один оператор управляет N магазинами Avito.
 *
 * В исходном (мультиарендном) проекте каждый клиент — отдельная строка `users`
 * с подпиской и paywall. Здесь весь бэкенд (avito_browser_sessions, avito_items,
 * ai_sales_* и т.д.) завязан на user_id + RLS, поэтому оператору нужна РОВНО ОДНА
 * строка `users`, под которой работают все Avito-сессии (account_index = «магазин»).
 *
 * Оператор моделируется как привилегированный client:
 *  - is_vibe_plus = true        → проходит проверку подписки в resolve-session
 *  - subscription_tier = top_floor_boss, subscription_end в будущем
 *  - avito_account_limit высокий → можно подключить много магазинов
 *
 * Это даёт нулевой ripple по типам (role остаётся 'client') и не требует
 * переписывать RLS/resolve-session. При интеграции в панель владельца этот
 * слой заменяется реальной аутентификацией.
 *
 * // STUB: owner-panel — заменить на аутентификацию панели владельца.
 */

/** Фиксированный UUID единственного оператора (под ним живут все Avito-сессии). */
export const OPERATOR_USER_ID =
  process.env.OPERATOR_USER_ID || "00000000-0000-4000-8000-000000000001";

/** Sentinel telegram_id (колонка UNIQUE NOT NULL в users). */
export const OPERATOR_TELEGRAM_ID = 1;

/** Сколько магазинов (account_index) разрешено подключить оператору. */
export const OPERATOR_AVITO_ACCOUNT_LIMIT = Number(
  process.env.OPERATOR_AVITO_ACCOUNT_LIMIT || 20
);

export interface OperatorCredentials {
  login: string;
  password: string;
}

/**
 * Логин/пароль оператора из переменных окружения.
 * Дефолты заданы только для локальной разработки — в проде ОБЯЗАТЕЛЬНО
 * переопределить через .env (OPERATOR_LOGIN / OPERATOR_PASSWORD).
 */
export function getOperatorCredentials(): OperatorCredentials {
  return {
    login: process.env.OPERATOR_LOGIN || "operator",
    password: process.env.OPERATOR_PASSWORD || "operator",
  };
}

/** Проверка введённых учётных данных (constant-time-ish сравнение). */
export function verifyOperatorCredentials(login: string, password: string): boolean {
  const creds = getOperatorCredentials();
  return safeEqual(login, creds.login) && safeEqual(password, creds.password);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Поля для idempotent-upsert строки оператора в `users`.
 * Вызывается при логине, чтобы все FK/RLS работали без ручного сидирования БД.
 */
export function operatorUserRow() {
  // Минимум колонок, реально существующих в прод-схеме (dimaworksreal/avito-project).
  // Бизнес-поля подписки/уровня/баланса в прод-схеме удалены — приложение их
  // читает через `??` фолбэки в mapOperatorUser, так что отсутствие = безопасно.
  return {
    id: OPERATOR_USER_ID,
    role: "owner" as const,
    telegram_id: OPERATOR_TELEGRAM_ID,
    name: "Оператор",
    avito_account_limit: OPERATOR_AVITO_ACCOUNT_LIMIT,
  };
}
