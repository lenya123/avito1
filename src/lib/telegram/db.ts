/**
 * Supabase клиент для Telegram ботов
 *
 * Используется service role key для доступа к БД без RLS ограничений
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { scheduleDeactivateReferral } from "@/lib/jobs";

// Создаём клиент с service role для ботов
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

// Singleton для переиспользования в рамках одного запроса
let dbClient: ReturnType<typeof createBotDbClient> | null = null;

export function getBotDb() {
  if (!dbClient) {
    dbClient = createBotDbClient();
  }
  return dbClient;
}

// ============================================
// Хелперы для работы с пользователями
// ============================================

/**
 * Находит пользователя по Telegram ID
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
 * Создаёт нового клиента
 */
export async function createClientUser(params: {
  telegramId: number;
  telegramUsername?: string;
  name?: string;
  referralCode?: string;
  avatarUrl?: string | null;
}) {
  const db = getBotDb();

  // Генерируем site_key
  const siteKey = generateSiteKey();

  // Генерируем реферальный код
  const userReferralCode = generateReferralCode();

  // Ищем реферера
  let referredBy: string | null = null;
  if (params.referralCode) {
    const { data: referrer } = await db
      .from("users")
      .select("id")
      .eq("referral_code", params.referralCode)
      .single();

    if (referrer) {
      referredBy = referrer.id;
    }
  }

  const { data, error } = await db
    .from("users")
    .insert({
      telegram_id: params.telegramId,
      telegram_username: params.telegramUsername || null,
      name: params.name || params.telegramUsername || "Клиент",
      avatar_url: params.avatarUrl || null,
      role: "client",
      site_key: siteKey,
      referral_code: userReferralCode,
      referred_by: referredBy,
      subscription_tier: "none",
      level: 0,
      deposit: 0,
      referral_deposit: 0,
      notification_order_status: true,
      notification_new_products: true,
      notification_promotions: false,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating user:", error);
    throw error;
  }

  // Создаём запись referral_bonuses если есть реферер
  if (referredBy && data) {
    try {
      const { data: settings } = await db
        .from("settings")
        .select("referral_first_order_bonus, referral_percent_cap, referral_period_days")
        .single();

      const bonusPeriodDays = settings?.referral_period_days ?? 60;
      const bonusPeriodEnds = new Date();
      bonusPeriodEnds.setDate(bonusPeriodEnds.getDate() + bonusPeriodDays);

      const { data: bonus } = await db
        .from("referral_bonuses")
        .insert({
          referrer_id: referredBy,
          referral_id: data.id,
          first_order_bonus: settings?.referral_first_order_bonus ?? 500,
          percent_bonus_cap: settings?.referral_percent_cap ?? 7000,
          bonus_period_ends_at: bonusPeriodEnds.toISOString(),
        })
        .select("id")
        .single();

      if (bonus) {
        try {
          await scheduleDeactivateReferral(bonus.id);
        } catch (jobErr) {
          console.error("[createClientUser] Failed to schedule referral deactivation:", jobErr);
        }
      }
    } catch (refErr) {
      console.error("[createClientUser] Failed to create referral bonus:", refErr);
    }
  }

  return data;
}

/**
 * Обновляет site_key пользователя
 */
export async function regenerateSiteKey(userId: string) {
  const db = getBotDb();
  const newKey = generateSiteKey();

  const { data, error } = await db
    .from("users")
    .update({ site_key: newKey })
    .eq("id", userId)
    .select("site_key")
    .single();

  if (error) {
    console.error("Error regenerating site key:", error);
    throw error;
  }

  return data?.site_key;
}

/**
 * Обновляет настройки уведомлений
 */
export async function updateNotificationSettings(
  userId: string,
  settings: {
    notification_order_status?: boolean;
    notification_new_products?: boolean;
    notification_promotions?: boolean;
  }
) {
  const db = getBotDb();

  const { error } = await db.from("users").update(settings).eq("id", userId);

  if (error) {
    console.error("Error updating notification settings:", error);
    throw error;
  }
}

// ============================================
// Хелперы для работы с заказами
// ============================================

/**
 * Получает активные заказы клиента
 */
export async function getClientActiveOrders(clientId: string) {
  const db = getBotDb();

  const activeStatuses = [
    "awaiting_shipment",
    "collecting",
    "in_transit",
    "return_in_transit",
    "return_arrived",
    "problem",
  ];

  const { data, error } = await db
    .from("orders")
    .select(
      `
      *,
      product:products(name, brand),
      product_size:product_sizes(size)
    `
    )
    .eq("client_id", clientId)
    .in("status", activeStatuses)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching orders:", error);
    return [];
  }

  return data || [];
}

/**
 * Получает статистику клиента
 * Логика расчётов синхронизирована с /api/stats
 */
export async function getClientStats(clientId: string) {
  const db = getBotDb();

  const excludedStatuses = ["cancelled", "disposed", "trash"];

  // Заказы за последние 30 дней (как на сайте "month")
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const { data: monthOrders } = await db
    .from("orders")
    .select("client_price, sale_price, client_profit, status")
    .eq("client_id", clientId)
    .gte("created_at", startDate.toISOString());

  // Активные заказы (вложено) — без фильтра по дате, как на сайте
  const activeStatuses = ["awaiting_shipment", "collecting", "in_transit"];
  const { data: activeOrders } = await db
    .from("orders")
    .select("client_price")
    .eq("client_id", clientId)
    .in("status", activeStatuses);

  // Все заказы (для all-time статистики)
  const { data: allOrders } = await db.from("orders").select("status").eq("client_id", clientId);

  const monthData = (monthOrders || []).filter(
    (o) => o.status && !excludedStatuses.includes(o.status)
  );
  const allData = (allOrders || []).filter((o) => o.status && !excludedStatuses.includes(o.status));

  // Выручка и прибыль — только completed (как на сайте)
  const completedMonth = monthData.filter((o) => o.status === "completed");

  const inProgressCount = activeOrders?.length || 0;
  const inProgressAmount = activeOrders?.reduce((sum, o) => sum + (o.client_price || 0), 0) || 0;

  const monthStats = {
    orders: monthData.length,
    revenue: completedMonth.reduce((sum, o) => sum + (o.sale_price || 0), 0),
    profit: completedMonth.reduce((sum, o) => sum + (o.client_profit || 0), 0),
    invested: inProgressAmount,
    investedCount: inProgressCount,
  };

  const totalCompleted = allData.filter((o) => o.status === "completed").length;
  const totalInTransit = allData.filter((o) => activeStatuses.includes(o.status || "")).length;
  const totalReturns = allData.filter((o) => o.status?.startsWith("return")).length;
  const returnRate = allData.length > 0 ? Math.round((totalReturns / allData.length) * 100) : 0;

  return {
    month: monthStats,
    total: {
      orders: allData.length,
      inTransit: totalInTransit,
      completed: totalCompleted,
      returns: totalReturns,
      returnRate,
    },
  };
}

// ============================================
// Хелперы для отправщика
// ============================================

/**
 * Авторизует отправщика по логину/паролю
 */
export async function authenticateShipper(login: string, passwordHash: string) {
  const db = getBotDb();

  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("role", "shipper")
    .eq("email", login)
    .eq("password_hash", passwordHash)
    .single();

  if (error) {
    return null;
  }

  return data;
}

/**
 * Получает статистику отправщика
 */
export async function getShipperStats(shipperId: string) {
  const db = getBotDb();

  // Статистика за сегодня
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: todayOrders } = await db
    .from("orders")
    .select("status")
    .eq("shipped_by", shipperId)
    .gte("shipped_at", today.toISOString());

  // Статистика за месяц
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: monthOrders } = await db
    .from("orders")
    .select("status")
    .eq("shipped_by", shipperId)
    .gte("shipped_at", startOfMonth.toISOString());

  const todayShipped = todayOrders?.length || 0;
  const monthShipped = monthOrders?.length || 0;

  // Ставка из настроек
  const { data: settings } = await db.from("settings").select("shipper_rate").single();
  const ratePerOrder = settings?.shipper_rate || 150;

  return {
    today: {
      shipped: todayShipped,
      earned: todayShipped * ratePerOrder,
    },
    month: {
      shipped: monthShipped,
      earned: monthShipped * ratePerOrder,
    },
  };
}

// ============================================
// Хелперы для владельца
// ============================================

/**
 * Получает дневную статистику для владельца
 */
export async function getOwnerDailyStats() {
  const db = getBotDb();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Заказы за сегодня
  const { data: orders } = await db
    .from("orders")
    .select("client_price, sale_price, purchase_price, status")
    .gte("created_at", today.toISOString());

  // Новые клиенты
  const { count: newClients } = await db
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("role", "client")
    .gte("created_at", today.toISOString());

  const ordersData = orders || [];

  const revenue = ordersData.reduce((sum, o) => sum + o.client_price, 0);
  const profit = ordersData.reduce((sum, o) => sum + (o.client_price - o.purchase_price), 0);

  return {
    orders: ordersData.length,
    revenue,
    profit,
    newClients: newClients || 0,
  };
}

/**
 * Находит клиента по username
 */
export async function findClientByUsername(username: string) {
  const db = getBotDb();

  // Убираем @ если есть
  const cleanUsername = username.replace("@", "");

  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("role", "client")
    .eq("telegram_username", cleanUsername)
    .single();

  if (error) {
    return null;
  }

  return data;
}

/**
 * Выдаёт/забирает +ВАЙБ
 */
export async function toggleVibePlus(userId: string, grantedBy: string, enable: boolean) {
  const db = getBotDb();

  const { error } = await db
    .from("users")
    .update({
      is_vibe_plus: enable,
      vibe_plus_granted_at: enable ? new Date().toISOString() : null,
      vibe_plus_granted_by: enable ? grantedBy : null,
      deposit_limit: enable ? -100000 : 0,
    })
    .eq("id", userId);

  if (error) {
    console.error("Error toggling vibe plus:", error);
    throw error;
  }
}

// ============================================
// Утилиты
// ============================================

function generateSiteKey(): string {
  // 64 hex символа для совместимости с авторизацией
  const chars = "0123456789abcdef";
  let key = "";

  for (let i = 0; i < 64; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return key;
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return code;
}
