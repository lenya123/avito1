/**
 * Получение статистики Avito за сегодня (delayed job) — через web proxy.
 *
 * Запускается через 61с после основной синхронизации.
 * Использует cookies + proxy из браузерной сессии.
 */

import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAvitoItemStatsPeriod, SessionExpiredError } from "@/lib/avito/web-client";
import type { SyncAvitoTodayStatsJobData } from "../queues";
import { scheduleAvitoLogin } from "../queues";

export async function handleSyncAvitoTodayStats(
  job: Job<SyncAvitoTodayStatsJobData>
): Promise<void> {
  const { userId, itemIds, sessionId } = job.data;

  if (!itemIds.length) {
    console.log("[sync-avito-today] No items to fetch stats for");
    return;
  }

  const supabase = createServiceClient();

  // Сессия КОНКРЕТНОГО акка по sessionId (мультиаккаунт): иначе today-stats
  // акка #2 ходили бы через cookies/proxy акка #1 и писались в его строки.
  // Фолбэк на account#1 — только для старых джобов без sessionId.
  const sessionQuery = supabase
    .from("avito_browser_sessions")
    .select("id, account_index, cookies, user_agent, proxy_url, browser_fingerprint")
    .eq("status", "active");
  const { data: session } = sessionId
    ? await sessionQuery.eq("id", sessionId).maybeSingle()
    : await sessionQuery
        .eq("user_id", userId)
        .order("account_index", { ascending: true })
        .limit(1)
        .maybeSingle();

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

  // /web/1/profile/items/stats умер (404). Сегодняшние счётчики берём из
  // /web/1/vas/stats ПОШТУЧНО — это живой per-day источник; вытаскиваем бакет
  // за сегодня (если Avito ещё не отдаёт today — берём самый свежий день).
  try {
    let updated = 0;
    for (const itemId of itemIds) {
      try {
        const st = await fetchAvitoItemStatsPeriod(browserSession, Number(itemId), {
          from: todayStr,
          to: todayStr,
        });
        const daysSorted = Object.keys(st?.daily ?? {}).sort();
        const key = daysSorted.includes(todayStr)
          ? todayStr
          : daysSorted[daysSorted.length - 1];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const today = (key ? (st!.daily as any)[key] : null) ?? {};
        await supabase
          .from("avito_items")
          .update({
            views_today: Number(today.views) || 0,
            favorites_today: Number(today.favorites) || 0,
            contacts_today: Number(today.contacts) || 0,
          })
          .eq("session_id", session.id) // скоуп по акку (мультиаккаунт)
          .eq("avito_item_id", itemId);
        updated++;
      } catch (perItemErr) {
        if (perItemErr instanceof SessionExpiredError) throw perItemErr;
        console.error(`[sync-avito-today] item ${itemId} error:`, perItemErr);
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    console.log(`[sync-avito-today] Updated ${updated}/${itemIds.length} items for user ${userId}`);
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
