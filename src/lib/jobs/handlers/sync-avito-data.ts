/**
 * Периодическая синхронизация данных Avito через web proxy.
 *
 * Запускается через BullMQ (self-rescheduling с jitter).
 * Использует ТОЛЬКО браузерные сессии (cookies + IPv4 прокси).
 * НЕ требует Avito Developer API credentials.
 *
 * Итерирует по active avito_browser_sessions.
 * Проверяет account_index <= user.avito_account_limit.
 *
 * Антидетект:
 * - Сессии обрабатываются в случайном порядке (shuffle)
 * - Случайная задержка 8-25с между сессиями
 * - Ночью 60% сессий пропускают цикл (shouldSkipSync)
 * - Каждый sync цикл внутри syncAvitoUser() имеет случайные паузы
 */

import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { syncAvitoUser } from "@/lib/avito/sync";
import { SessionExpiredError } from "@/lib/avito/web-client";
import { scheduleAvitoLogin, rescheduleAvitoSync } from "../queues";
import {
  shuffle,
  shouldSkipSync,
  getSessionStaggerDelay,
  humanDelay,
  getMoscowTimePeriod,
} from "@/lib/avito/human-timing";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleSyncAvitoData(_job: Job): Promise<void> {
  const supabase = createServiceClient();

  // Находим все АКТИВНЫЕ браузерные сессии с cookies
  // Больше не требуем avito_client_id/secret — всё через cookies + proxy
  const { data: sessions, error } = await supabase
    .from("avito_browser_sessions")
    .select("id, user_id, account_index, cookies, user_agent, proxy_url, browser_fingerprint")
    .eq("status", "active");

  if (error || !sessions?.length) {
    console.log("[sync-avito] No active browser sessions found");
    await rescheduleAvitoSync();
    return;
  }

  // Получаем лимиты пользователей для проверки
  const userIds = Array.from(new Set(sessions.map((s) => s.user_id)));
  const { data: users } = await supabase
    .from("users")
    .select("id, avito_account_limit")
    .in("id", userIds);

  const userLimitMap = new Map((users || []).map((u) => [u.id, u.avito_account_limit ?? 1]));

  // Фильтруем: пропускаем сессии где account_index > лимит
  const activeSessions = sessions.filter((s) => {
    const limit = userLimitMap.get(s.user_id) ?? 1;
    return s.account_index <= limit;
  });

  // Фильтруем: пропускаем сессии без cookies (нечем парсить)
  const validSessions = activeSessions.filter((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cookies = s.cookies as any[];
    return cookies && cookies.length > 0;
  });

  // Случайный порядок
  const shuffled = shuffle(validSessions);

  const period = getMoscowTimePeriod();
  let skippedCount = 0;
  let totalItems = 0;
  let totalChats = 0;
  let failedSessions = 0;

  console.log(
    `[sync-avito] Starting sync: ${shuffled.length} session(s), period: ${period}, ` +
      `${sessions.length - validSessions.length} without cookies/over limit`
  );

  for (let i = 0; i < shuffled.length; i++) {
    const session = shuffled[i];

    // Каждая сессия может пропустить цикл
    if (shouldSkipSync()) {
      skippedCount++;
      console.log(`[sync-avito] Skipping session ${session.id} (${period}, random skip)`);
      continue;
    }

    // Случайная задержка между сессиями
    if (i > 0) {
      const stagger = getSessionStaggerDelay();
      await humanDelay(stagger, stagger + 2000);
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cookies = (session.cookies as any[]) ?? [];
      const userAgent = session.user_agent ?? "Mozilla/5.0";
      const proxyUrl = session.proxy_url ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fp = session.browser_fingerprint as any;

      const result = await syncAvitoUser({
        session: {
          cookies,
          userAgent,
          proxyUrl,
          platform: fp?.platform ?? null,
        },
        userId: session.user_id,
        supabase,
        sessionId: session.id,
      });

      // Обновляем last_sync_at
      await supabase
        .from("avito_browser_sessions")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", session.id);

      totalItems += result.items;
      totalChats += result.chats;
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        console.warn(
          `[sync-avito] Session expired for ${session.id} (user ${session.user_id}), scheduling re-login`
        );
        await supabase
          .from("avito_browser_sessions")
          .update({ status: "expired" })
          .eq("id", session.id);

        // Задержка перед re-login
        await humanDelay(5_000, 15_000);
        await scheduleAvitoLogin(session.user_id, session.account_index);
      } else {
        failedSessions++;
        console.error(
          `[sync-avito] Error for session ${session.id} (user ${session.user_id}, account ${session.account_index}):`,
          err
        );
      }
    }
  }

  console.log(
    `[sync-avito] Done: ${totalItems} items, ${totalChats} chats. ` +
      `${skippedCount} skipped, ${failedSessions} failed.`
  );

  // Перепланируем следующий цикл с jitter
  await rescheduleAvitoSync();
}
