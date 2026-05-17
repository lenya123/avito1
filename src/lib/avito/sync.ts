/**
 * Shared Avito sync logic — ТОЛЬКО через web proxy (cookies + IPv4 прокси).
 *
 * Не использует Official Avito API (OAuth) — вместо этого все запросы идут
 * через внутренние web API эндпоинты с cookies из браузерной сессии.
 * Каждый запрос проксируется через IPv4 прокси, привязанный к аккаунту.
 *
 * Используется в:
 * - POST /api/avito/sync (ручная синхронизация)
 * - BullMQ handler sync-avito-data (периодическая)
 *
 * Поток:
 * 1. Items sync (2 страницы по 50) + delay между страницами
 * 2. Stats (views/favorites/contacts) через web API → batch upsert
 * 3. scheduleAvitoTodayStats() → fire-and-forget (delayed 61s)
 * 4. Chats sync (limit 100)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAvitoItems,
  fetchAvitoItemStats,
  fetchAvitoChats,
  SessionExpiredError,
} from "./web-client";
import { scheduleAvitoTodayStats } from "@/lib/jobs/queues";
import { humanDelay, getPageDelay, getWarmupDelay } from "./human-timing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Браузерная сессия для web proxy парсинга */
export interface WebBrowserSession {
  cookies: Array<{ name: string; value: string }>;
  userAgent: string;
  proxyUrl: string | null;
  platform?: string | null;
}

export interface SyncAvitoUserOptions {
  session: WebBrowserSession;
  userId: string;
  supabase: SupabaseClient;
  sessionId?: string;
}

export interface SyncAvitoResult {
  items: number;
  chats: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ITEMS_PER_PAGE = 50;
// Дата начала для статистики — покрываем всю историю
const STATS_DATE_FROM = "2019-01-01";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function syncAvitoUser(opts: SyncAvitoUserOptions): Promise<SyncAvitoResult> {
  const { session, userId, supabase, sessionId } = opts;

  const now = new Date().toISOString();
  let itemsSynced = 0;
  let chatsSynced = 0;

  // Имитация "открытия приложения" — случайная пауза перед первым запросом
  const warmup = getWarmupDelay();
  await humanDelay(warmup, warmup + 1000);

  // --- 1. Sync Items через web API ---
  // Загружаем оба таба: active + inactive (ждущие действий)
  const allItemIds: number[] = [];
  const tabs: Array<{ status: string; label: string }> = [
    { status: "active", label: "active" },
    { status: "inactive", label: "inactive" },
  ];

  for (const tab of tabs) {
    try {
      const itemsResult = await fetchAvitoItems(session, 1, ITEMS_PER_PAGE, tab.status);

      if (!itemsResult.items.length) {
        console.log(`[avito-sync] No ${tab.label} items for ${userId}`);
        continue;
      }

      const rows = itemsResult.items.map((item) => ({
        user_id: userId,
        ...(sessionId ? { session_id: sessionId } : {}),
        avito_item_id: item.id,
        title: item.title,
        price: item.price,
        status: tab.status,
        url: item.url,
        image_url: item.imageUrl,
        category_name: item.categoryName,
        address: item.address,
        contacts: item.contacts,
        favorites: item.favorites,
        views: item.views,
        synced_at: now,
        updated_at: now,
      }));

      const { error } = await supabase.from("avito_items").upsert(rows, {
        onConflict: "user_id,avito_item_id",
      });

      if (error) {
        console.error(`[avito-sync] Items upsert error (${tab.label}) for ${userId}:`, error.message);
      } else {
        itemsSynced += rows.length;
        allItemIds.push(...itemsResult.items.map((i) => i.id));
        console.log(`[avito-sync] ${tab.label}: ${rows.length} items for ${userId}`);
      }

      // Пауза между табами
      const pd = getPageDelay();
      await humanDelay(pd, pd + 500);
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      console.error(`[avito-sync] Items ${tab.label} error for ${userId}:`, err);
    }
  }

  // Пауза перед stats
  await humanDelay(3_000, 7_000);

  // --- 2. Stats (views, favorites, contacts) через web API ---
  try {
    // Берём все item ID из БД (не только что синхронизированные)
    const { data: allItems } = await supabase
      .from("avito_items")
      .select("avito_item_id, views, favorites, contacts")
      .eq("user_id", userId);

    if (allItems?.length) {
      const itemIds = allItems.map((i) => i.avito_item_id);
      const currentMap = new Map(allItems.map((i) => [i.avito_item_id, i]));

      // Московское время для корректных границ дней
      const moscowNow = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const dateToStr = moscowNow.toISOString().split("T")[0];

      const statsResult = await fetchAvitoItemStats(session, STATS_DATE_FROM, dateToStr, itemIds);

      if (statsResult.items.length > 0) {
        const statsRows = statsResult.items.map((stat) => {
          const current = currentMap.get(stat.itemId);
          // GREATEST: не уменьшаем значения при смещении окна
          return {
            user_id: userId,
            avito_item_id: stat.itemId,
            views: Math.max(current?.views ?? 0, stat.views),
            favorites: Math.max(current?.favorites ?? 0, stat.favorites),
            contacts: Math.max(current?.contacts ?? 0, stat.contacts),
          };
        });

        await supabase.from("avito_items").upsert(statsRows, {
          onConflict: "user_id,avito_item_id",
        });
        console.log(`[avito-sync] Stats updated for ${userId}: ${statsRows.length} items`);
      }

      // Today stats — delayed BullMQ job (61s), fire-and-forget
      scheduleAvitoTodayStats(userId, itemIds).catch((e) => {
        console.error(`[avito-sync] Failed to schedule today stats for ${userId}:`, e);
      });
    }
  } catch (statsErr) {
    if (statsErr instanceof SessionExpiredError) throw statsErr;
    console.error(`[avito-sync] Stats error for ${userId}:`, statsErr);
  }

  // Пауза перед чатами
  await humanDelay(2_000, 6_000);

  // --- 3. Sync Chats через web API ---
  try {
    const chatsResult = await fetchAvitoChats(session, 100);

    if (chatsResult.chats.length > 0) {
      const chatRows = chatsResult.chats.map((chat) => ({
        user_id: userId,
        ...(sessionId ? { session_id: sessionId } : {}),
        avito_chat_id: chat.id,
        buyer_name: chat.buyerName,
        buyer_avito_id: chat.buyerAvitoId,
        item_id: chat.itemId,
        item_title: chat.itemTitle,
        item_price: chat.itemPrice,
        item_image_url: chat.itemImageUrl,
        item_url: chat.itemUrl,
        last_message: chat.lastMessage,
        last_message_at: chat.lastMessageAt,
        last_message_direction: chat.lastMessageDirection,
        unread_count: chat.unreadCount,
        synced_at: now,
        updated_at: now,
      }));

      const { error } = await supabase.from("avito_chats").upsert(chatRows, {
        onConflict: "user_id,avito_chat_id",
      });

      if (error) {
        console.error(`[avito-sync] Chats upsert error for ${userId}:`, error.message);
      } else {
        chatsSynced = chatRows.length;
      }
    }
  } catch (chatsErr) {
    if (chatsErr instanceof SessionExpiredError) throw chatsErr;
    console.error(`[avito-sync] Chats error for ${userId}:`, chatsErr);
  }

  return { items: itemsSynced, chats: chatsSynced };
}
