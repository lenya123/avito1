/**
 * BullMQ handler: sync-avito-orders
 *
 * Синхронизирует заказы Avito Доставка для всех сессий с активной
 * браузерной сессией.
 *
 * Антидетект:
 * - Сессии в случайном порядке
 * - Случайные задержки 10-30с между сессиями (web API более чувствительный)
 * - Ночью большинство сессий пропускаются
 * - Warmup пауза перед первым запросом
 */

import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAvitoOrders, SessionExpiredError } from "@/lib/avito/web-client";
import { scheduleAvitoLogin, rescheduleAvitoOrdersSync } from "../queues";
import type { SyncAvitoOrdersJobData } from "../queues";
import {
  shuffle,
  shouldSkipSync,
  humanDelay,
  getWarmupDelay,
  getMoscowTimePeriod,
} from "@/lib/avito/human-timing";

export async function handleSyncAvitoOrders(job: Job<SyncAvitoOrdersJobData>): Promise<void> {
  const supabase = createServiceClient();

  // Получаем сессии с активным статусом
  let query = supabase
    .from("avito_browser_sessions")
    .select("id, user_id, account_index, cookies, user_agent, proxy_url, browser_fingerprint")
    .eq("status", "active");

  if (job.data.userId) {
    query = query.eq("user_id", job.data.userId);
  }

  const { data: sessions, error } = await query;

  if (error || !sessions?.length) {
    console.log("[sync-avito-orders] No active sessions found");
    return;
  }

  // Случайный порядок
  const shuffled = shuffle(sessions);
  const period = getMoscowTimePeriod();
  let skippedCount = 0;

  console.log(
    `[sync-avito-orders] Starting sync: ${shuffled.length} session(s), period: ${period}`
  );

  for (let i = 0; i < shuffled.length; i++) {
    const session = shuffled[i];

    // Ночью пропускаем чаще — web API более чувствительный
    if (shouldSkipSync()) {
      skippedCount++;
      console.log(`[sync-avito-orders] Skipping session ${session.id} (${period}, random skip)`);
      continue;
    }

    // Задержка между сессиями: 10-30с для web API (больше чем для official API)
    if (i > 0) {
      await humanDelay(10_000, 30_000);
    } else {
      // Warmup перед первым запросом
      await humanDelay(getWarmupDelay(), getWarmupDelay() + 2000);
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cookies = (session.cookies as any[]) ?? [];
      const userAgent = session.user_agent ?? "Mozilla/5.0";
      const proxyUrl = session.proxy_url ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fp = session.browser_fingerprint as any;
      const platform = fp?.platform ?? null;

      const { orders } = await fetchAvitoOrders({ cookies, userAgent, proxyUrl, platform });

      if (orders.length === 0) {
        console.log(`[sync-avito-orders] No orders for session: ${session.id}`);
      } else {
        // Upsert заказов в БД — с session_id
        const rows = orders.map((o) => ({
          user_id: session.user_id,
          session_id: session.id,
          avito_order_id: o.orderId,
          status: o.status.value,
          status_label: o.status.label,
          required_action: o.status.requiredAction ?? false,
          item_title: o.imgSet[0]?.alt ?? null,
          item_img_url: o.imgSet[0]?.src ?? null,
          cost_total: o.cost.total,
          provider: o.provider.value,
          provider_label: o.provider.label,
          tracking_number: o.provider.trackingNumber ?? o.provider.copiedTrackingNumber ?? null,
          channel_id: o.channelId,
          service_key: o.serviceKey,
          created_at_avito: o.createdAt || null,
          updated_at_avito: o.updatedAt || null,
          synced_at: new Date().toISOString(),
        }));

        const { error: upsertError } = await supabase
          .from("avito_orders")
          .upsert(rows, { onConflict: "user_id,avito_order_id" });

        if (upsertError) {
          console.error(
            `[sync-avito-orders] Upsert error for session: ${session.id}`,
            upsertError
          );
        } else {
          console.log(
            `[sync-avito-orders] session: ${session.id} (user ${session.user_id}, account ${session.account_index}) synced ${orders.length} orders`
          );
        }
      }

      // Обновляем last_sync_at
      await supabase
        .from("avito_browser_sessions")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", session.id);
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        console.warn(
          `[sync-avito-orders] Session expired for session: ${session.id}, scheduling re-login`
        );
        await supabase
          .from("avito_browser_sessions")
          .update({ status: "expired" })
          .eq("id", session.id);

        // Задержка перед re-login — не моментальная реакция
        await humanDelay(5_000, 15_000);
        await scheduleAvitoLogin(session.user_id, session.account_index);
      } else {
        console.error(`[sync-avito-orders] Error for session: ${session.id}`, err);
      }
    }
  }

  console.log(
    `[sync-avito-orders] Done. ${skippedCount} skipped of ${shuffled.length}.`
  );

  // Перепланируем следующий цикл с jitter
  await rescheduleAvitoOrdersSync();
}
