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
  fetchAvitoItemStatsPeriod,
  fetchAvitoChats,
  fetchAvitoChatMessages,
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
  /** BeduinUI per-user токен (m.avito.ru ?key=). Извлекается автоматически
   *  через fetchAvitoApiKey, хранится в avito_browser_sessions.api_key. */
  apiKey?: string | null;
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

  // --- 1. Sync Items ---
  // Если у сессии есть apiKey — используем mobile BeduinUI
  // (m.avito.ru/api/13/serp/profile/items?shortcut=...), он отдаёт любой таб:
  // active / paused / archived / draft / blocked. Если apiKey нет — fallback
  // на web-flow внутри fetchAvitoItems (умеет только active + inactive).
  const allItemIds: number[] = [];
  // В UI отображаются только «Активные» и «Снятые с публикации (Архив)».
  // Tabs остальных категорий (inactive=Ждут действий, sellervation) не нужны.
  const tabs: Array<{ status: string; label: string }> = session.apiKey
    ? [
        { status: "active", label: "active" },
        { status: "old", label: "Архив" },
      ]
    : [
        { status: "active", label: "active" },
        { status: "inactive", label: "inactive" },
      ];

  // apiKey можно извлечь из URL ответных объявлений (Avito прокидывает
  // ?key=af0... в href). Сохраняем при первом обнаружении в эту сессию.
  let extractedApiKey: string | null = null;

  for (const tab of tabs) {
    try {
      const itemsResult = await fetchAvitoItems(session, 1, ITEMS_PER_PAGE, tab.status);

      if (!itemsResult.items.length) {
        console.log(`[avito-sync] No ${tab.label} items for ${userId}`);
        continue;
      }

      // Скан apiKey в URL объявлений (выполняется один раз за sync)
      if (!extractedApiKey && !session.apiKey) {
        for (const it of itemsResult.items) {
          const url = (it.url || "") + " " + ((it as unknown as { imageUrl?: string }).imageUrl || "");
          const m = url.match(/\baf[0-9a-z]{38,50}\b/);
          if (m) {
            extractedApiKey = m[0];
            console.log(`[avito-sync] extracted apiKey (len=${extractedApiKey.length}) from items URL`);
            break;
          }
        }
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
        onConflict: "session_id,avito_item_id",
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
      // Не пробрасываем SessionExpiredError из отдельного таба — Avito может
      // вернуть 401/403 для несуществующего/недоступного таба (напр.
      // /profile/items/blocked при пустом списке), это не значит что вся
      // сессия мертва. Логируем и идём к следующему табу.
      console.error(`[avito-sync] Items ${tab.label} error for ${userId}:`, err);
    }
  }

  // Sweep: удаляем из БД items которые Avito больше не отдаёт ни в одном табе
  // (юзер удалил их в Avito-кабинете напрямую). Применяется только если sync
  // действительно прошёл хоть один таб успешно — иначе можно случайно стереть
  // все при временной ошибке.
  if (sessionId && allItemIds.length > 0) {
    try {
      const { data: existingRows } = await supabase
        .from("avito_items")
        .select("avito_item_id")
        .eq("session_id", sessionId);
      const existingIds = new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (existingRows ?? []).map((r: any) => Number(r.avito_item_id))
      );
      const liveIds = new Set(allItemIds);
      const stale = Array.from(existingIds).filter((id) => !liveIds.has(id));
      if (stale.length > 0) {
        await supabase
          .from("avito_items")
          .delete()
          .eq("session_id", sessionId)
          .in("avito_item_id", stale);
        console.log(`[avito-sync] sweep removed ${stale.length} stale items`);
      }
    } catch (e) {
      console.error("[avito-sync] sweep stale items failed:", e);
    }
  }

  // Сохраняем извлечённый apiKey в БД (если это первый sync с ним)
  if (extractedApiKey && sessionId) {
    try {
      await supabase
        .from("avito_browser_sessions")
        .update({ api_key: extractedApiKey })
        .eq("id", sessionId);
      session.apiKey = extractedApiKey;
      console.log(`[avito-sync] saved apiKey for session ${sessionId}`);
    } catch (e) {
      console.error("[avito-sync] failed to save apiKey:", e);
    }
  }

  // Пауза перед stats
  await humanDelay(3_000, 7_000);

  // --- 2. Per-day stats (views/favorites/contacts) через /web/1/vas/stats ---
  // Avito web-flow НЕ имеет окно-эндпоинта на список объявлений (старый
  // /web/1/profile/items/stats отдаёт 404). Единственный живой источник —
  // POST /web/1/vas/stats, ПОШТУЧНО, возвращает РЕАЛЬНЫЕ дневные бакеты за
  // последние ~N дней (N растёт с возрастом объявления, до запрошенного окна).
  // Пишем каждый день в avito_item_stats_daily (session,item,date) — окно «за 30
  // дней» в overview = SUM этих дневных строк. Бэкфилл самоисцеляется: каждый
  // sync переписывает последние ~6-8 дней свежими значениями.
  try {
    const { data: allItems } = await supabase
      .from("avito_items")
      .select("avito_item_id")
      .eq("session_id", sessionId ?? "")
      .limit(200);

    const itemIds = (allItems ?? []).map((i) => Number(i.avito_item_id)).filter(Boolean);
    if (itemIds.length && sessionId) {
      // Окно запроса — 32 дня (с запасом), сервер сам отдаст сколько есть.
      const fromStr = new Date(Date.now() + 3 * 3600_000 - 32 * 86400_000)
        .toISOString()
        .slice(0, 10);
      const toStr = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dailyRows: any[] = [];
      for (const itemId of itemIds) {
        try {
          const st = await fetchAvitoItemStatsPeriod(session, itemId, {
            from: fromStr,
            to: toStr,
          });
          if (st?.daily) {
            for (const [date, d] of Object.entries(st.daily)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const day = d as any;
              dailyRows.push({
                user_id: userId,
                session_id: sessionId,
                avito_item_id: String(itemId),
                date,
                views: Number(day?.views) || 0,
                favorites: Number(day?.favorites) || 0,
                contacts: Number(day?.contacts) || 0,
                synced_at: now,
              });
            }
          }
        } catch (perItemErr) {
          if (perItemErr instanceof SessionExpiredError) throw perItemErr;
          console.error(`[avito-sync] vas/stats item ${itemId} error:`, perItemErr);
        }
        // Гуманная пауза между объявлениями (мягче на прокси/антибот).
        await humanDelay(800, 2_000);
      }

      if (dailyRows.length) {
        await supabase
          .from("avito_item_stats_daily")
          .upsert(dailyRows, { onConflict: "session_id,avito_item_id,date" });
        console.log(
          `[avito-sync] vas/stats: ${dailyRows.length} day-rows over ${itemIds.length} items for ${userId}`
        );
      }

      // Today stats — delayed BullMQ job (61s), fire-and-forget.
      // Передаём sessionId — джоб должен ходить через ЭТОТ акк (мультиаккаунт).
      scheduleAvitoTodayStats(userId, itemIds, sessionId).catch((e) => {
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
        onConflict: "session_id,avito_chat_id",
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

  // --- 4. Sync messages для недавних чатов (фон) ---
  // Предзаполняем диалоги (avito_messages), чтобы переписка открывалась мгновенно
  // и AI-агент/уведомления видели её без ручного открытия. Кап на свежие 30 чатов
  // (по last_message_at), пер-чат ошибки не валят синк, с паузами против антибота.
  if (sessionId) {
    try {
      await humanDelay(2_000, 4_000);
      const { data: ownerRow } = await supabase
        .from("avito_browser_sessions")
        .select("avito_user_id")
        .eq("id", sessionId)
        .maybeSingle();
      const ownerId =
        (ownerRow as { avito_user_id?: number | null } | null)?.avito_user_id ?? undefined;

      const { data: recentChats } = await supabase
        .from("avito_chats")
        .select("id, avito_chat_id")
        .eq("session_id", sessionId)
        .order("last_message_at", { ascending: false })
        .limit(30);

      let msgChats = 0;
      for (const ch of (recentChats ?? []) as Array<{ id: string; avito_chat_id: string }>) {
        try {
          const msgs = await fetchAvitoChatMessages(session, ch.avito_chat_id, 50, ownerId);
          if (msgs.length) {
            const rows = msgs.map((m) => ({
              chat_id: ch.id,
              user_id: userId,
              avito_message_id: m.id,
              direction: m.direction,
              content_text: m.text,
              content_image_url: m.imageUrl,
              message_type: String(m.type),
              author_id: m.authorId,
              avito_created_at: new Date(m.created * 1000).toISOString(),
            }));
            await supabase
              .from("avito_messages")
              .upsert(rows, { onConflict: "chat_id,avito_message_id" });
            msgChats++;
          }
        } catch (perChatErr) {
          if (perChatErr instanceof SessionExpiredError) throw perChatErr;
          // одиночный чат не валит весь синк
        }
        await humanDelay(600, 1_500);
      }
      if (msgChats) {
        console.log(`[avito-sync] messages synced for ${msgChats} chats (${userId})`);
      }
    } catch (msgErr) {
      if (msgErr instanceof SessionExpiredError) throw msgErr;
      console.error(`[avito-sync] messages error for ${userId}:`, msgErr);
    }
  }

  return { items: itemsSynced, chats: chatsSynced };
}
