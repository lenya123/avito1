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
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { fetchAvitoOrders, SessionExpiredError } from "@/lib/avito/web-client";
import { linkOrderToItem, extractReturnCode } from "@/lib/avito/order-enrich";
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
        // Объявления сессии — для связки заказ→объява (// STUB: эвристика)
        const { data: itemRows } = await supabase
          .from("avito_items")
          .select("avito_item_id, title")
          .eq("session_id", session.id)
          .limit(500);
        const itemsList = (itemRows ?? []) as Array<{
          avito_item_id: string | number;
          title: string | null;
        }>;

        // Upsert заказов в БД — с session_id + обогащение по ТЗ
        const rows = orders.map((o) => {
          const itemTitle = o.imgSet[0]?.alt ?? null;
          const avitoItemId = linkOrderToItem(itemTitle, itemsList);
          return {
            user_id: session.user_id,
            session_id: session.id,
            avito_order_id: o.orderId,
            avito_item_id: avitoItemId, // по какой объяве
            status: o.status.value,
            status_label: o.status.label,
            required_action: o.status.requiredAction ?? false,
            item_title: itemTitle,
            item_img_url: o.imgSet[0]?.src ?? null,
            cost_total: o.cost.total, // цена с учётом комиссий (выплата продавцу)
            provider: o.provider.value,
            provider_label: o.provider.label,
            tracking_number: o.provider.trackingNumber ?? o.provider.copiedTrackingNumber ?? null,
            return_code: extractReturnCode(o.status.value, o.status.label, o.info),
            source_tag: "avito", // тег «заказ с авито» для страницы панели
            channel_id: o.channelId,
            service_key: o.serviceKey,
            created_at_avito: o.createdAt || null,
            updated_at_avito: o.updatedAt || null,
            synced_at: new Date().toISOString(),
          };
        });

        const { error: upsertError } = await supabase
          .from("avito_orders")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(rows as any, { onConflict: "user_id,avito_order_id" });

        if (upsertError) {
          console.error(
            `[sync-avito-orders] Upsert error for session: ${session.id}`,
            upsertError
          );
        } else {
          console.log(
            `[sync-avito-orders] session: ${session.id} (user ${session.user_id}, account ${session.account_index}) synced ${orders.length} orders`
          );
          // Счётчик «заказали» на объявления + дневной снапшот (для KPI «за месяц»)
          await updateOrdersStats(session.id, session.user_id).catch((e) =>
            console.warn("[sync-avito-orders] stats update failed:", e)
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

/**
 * Обновить счётчик «заказали» по объявлениям + дневной снапшот метрик
 * (avito_item_stats_daily) — чтобы KPI «за месяц» накапливался реальными
 * данными. Best-effort: ошибки не ломают основной синк.
 */
async function updateOrdersStats(sessionId: string, userId: string): Promise<void> {
  const supabase = createServiceClientLoose();
  const todayMsk = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });

  const { data: orderRows } = await supabase
    .from("avito_orders")
    .select("avito_item_id, created_at_avito")
    .eq("session_id", sessionId)
    .not("avito_item_id", "is", null);

  const totals = new Map<string, number>();
  const today = new Map<string, number>();
  for (const o of (orderRows ?? []) as Array<{
    avito_item_id: string;
    created_at_avito: string | null;
  }>) {
    const id = o.avito_item_id;
    totals.set(id, (totals.get(id) ?? 0) + 1);
    const d = o.created_at_avito
      ? new Date(o.created_at_avito).toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" })
      : null;
    if (d === todayMsk) today.set(id, (today.get(id) ?? 0) + 1);
  }

  for (const [avitoItemId, total] of totals) {
    const todayCount = today.get(avitoItemId) ?? 0;
    await supabase
      .from("avito_items")
      .update({ orders_count: total, orders_today: todayCount })
      .eq("session_id", sessionId)
      .eq("avito_item_id", avitoItemId);

    // Дневной снапшот: orders за сегодня + текущие дельты *_today объявления
    const { data: it } = await supabase
      .from("avito_items")
      .select("views_today, favorites_today, contacts_today")
      .eq("session_id", sessionId)
      .eq("avito_item_id", avitoItemId)
      .maybeSingle();

    await supabase.from("avito_item_stats_daily").upsert(
      {
        user_id: userId,
        session_id: sessionId,
        avito_item_id: String(avitoItemId),
        date: todayMsk,
        views: it?.views_today ?? 0,
        favorites: it?.favorites_today ?? 0,
        contacts: it?.contacts_today ?? 0,
        orders: todayCount,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "session_id,avito_item_id,date" }
    );
  }
}
