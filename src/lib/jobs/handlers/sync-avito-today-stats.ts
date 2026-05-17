/**
 * Получение статистики Avito за сегодня (delayed job) — через web proxy.
 *
 * Запускается через 61с после основной синхронизации.
 * Использует cookies + proxy из браузерной сессии.
 */

import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAvitoItemStats, SessionExpiredError } from "@/lib/avito/web-client";
import type { SyncAvitoTodayStatsJobData } from "../queues";
import { scheduleAvitoLogin } from "../queues";

export async function handleSyncAvitoTodayStats(
  job: Job<SyncAvitoTodayStatsJobData>
): Promise<void> {
  const { userId, itemIds } = job.data;

  if (!itemIds.length) {
    console.log("[sync-avito-today] No items to fetch stats for");
    return;
  }

  const supabase = createServiceClient();

  // Получаем активную браузерную сессию с cookies
  const { data: session } = await supabase
    .from("avito_browser_sessions")
    .select("id, account_index, cookies, user_agent, proxy_url, browser_fingerprint")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("account_index", { ascending: true })
    .limit(1)
    .single();

  if (!session) {
    console.error(`[sync-avito-today] No active browser session for user ${userId}`);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookies = (session.cookies as any[]) ?? [];
  if (cookies.length === 0) {
    console.error(`[sync-avito-today] No cookies for user ${userId}`);
    return;
  }

  const userAgent = session.user_agent ?? "Mozilla/5.0";
  const proxyUrl = session.proxy_url ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fp = session.browser_fingerprint as any;

  const browserSession = {
    cookies,
    userAgent,
    proxyUrl,
    platform: fp?.platform ?? null,
  };

  const moscowNow = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const todayStr = moscowNow.toISOString().split("T")[0];

  try {
    const result = await fetchAvitoItemStats(browserSession, todayStr, todayStr, itemIds);

    if (result.items.length > 0) {
      // Сбрасываем today-статистику
      await supabase
        .from("avito_items")
        .update({ views_today: 0, favorites_today: 0, contacts_today: 0 })
        .eq("user_id", userId);

      // Обновляем каждый item
      for (const stat of result.items) {
        await supabase
          .from("avito_items")
          .update({
            views_today: stat.views,
            favorites_today: stat.favorites,
            contacts_today: stat.contacts,
          })
          .eq("user_id", userId)
          .eq("avito_item_id", stat.itemId);
      }

      console.log(
        `[sync-avito-today] Updated ${result.items.length} items for user ${userId}`
      );
    } else {
      console.log(`[sync-avito-today] No stats returned for user ${userId}`);
    }
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      console.warn(`[sync-avito-today] Session expired for user ${userId}, scheduling re-login`);
      await supabase
        .from("avito_browser_sessions")
        .update({ status: "expired" })
        .eq("id", session.id);
      await scheduleAvitoLogin(userId, session.account_index);
    } else {
      console.error(`[sync-avito-today] Error for user ${userId}:`, err);
    }
  }
}
