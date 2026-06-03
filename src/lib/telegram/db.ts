/**
 * Supabase клиент для Telegram ботов.
 *
 * Stage 1.5 пивота: файл сокращён до минимума, нужного shipper-боту.
 * Клиентские функции (createClientUser, findClientByUsername, toggleVibePlus,
 * updateNotificationSettings, getClientActiveOrders, getClientStats,
 * getOwnerDailyStats, regenerateSiteKey, authenticateShipper) и реферальная
 * логика вырезаны — они обращались к удалённым колонкам/таблицам
 * (users.subscription_tier/level/deposit/referral_code/notification_*,
 * referral_bonuses). Customer-bot (Этап 3) будет переписан под новую модель
 * customers; owner-bot (Этап 10) — под новые команды.
 *
 * Использует service role key → RLS обходится.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

export function createBotDbClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase credentials for bot");
  }

  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

let dbClient: ReturnType<typeof createBotDbClient> | null = null;

export function getBotDb() {
  if (!dbClient) {
    dbClient = createBotDbClient();
  }
  return dbClient;
}

/**
 * Находит пользователя по Telegram ID — используется shipper-ботом
 * при проверке роли.
 */
export async function findUserByTelegramId(telegramId: number) {
  const db = getBotDb();
  const { data, error } = await db.from("users").select("*").eq("telegram_id", telegramId).single();

  if (error && error.code !== "PGRST116") {
    console.error("Error finding user:", error);
  }

  return data;
}

/**
 * Находит клиента оптовика по Telegram ID. Используется customer-bot'ом
 * на `/start` и при каждом update'е для резолвинга `customer_id`.
 */
export async function findCustomerByTelegramId(telegramId: number) {
  const db = getBotDb();
  const { data, error } = await db
    .from("customers")
    .select("*")
    .eq("tg_user_id", telegramId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error finding customer:", error);
  }

  return data;
}

/**
 * Создаёт запись клиента при первом `/start` в customer-bot.
 * Имя берётся из Telegram first_name, username — из Telegram username.
 * Телефон не запрашиваем (см. план Stage 3, решение K.2).
 */
export async function createCustomer(params: {
  tgUserId: number;
  telegramUsername?: string;
  name?: string;
}) {
  const db = getBotDb();
  const { data, error } = await db
    .from("customers")
    .insert({
      tg_user_id: params.tgUserId,
      telegram_username: params.telegramUsername ?? null,
      name: params.name ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating customer:", error);
    throw error;
  }

  return data;
}
