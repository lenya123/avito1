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
import {
  fetchAvitoOrders,
  fetchAvitoOrderDetails,
  fetchAvitoOrderProfileDetail,
  fetchAvitoOrderLog,
  fetchAvitoApiKey,
  SessionExpiredError,
  type BrowserSession,
} from "@/lib/avito/web-client";
import { linkOrderToItem, extractReturnCode } from "@/lib/avito/order-enrich";
import {
  parseAvitoOrderDetail,
  parseAvitoOrderLog,
  type ParsedAvitoOrderDetail,
  type ParsedAvitoOrderLog,
} from "@/lib/avito/order-detail-parser";
import { upsertOrderFromAvito, type AvitoOrderRow, type ProductMapping } from "@/lib/avito/order-sync";
import { scheduleAvitoLogin, rescheduleAvitoOrdersSync, scheduleAvitoRequestSize } from "../queues";
import { sendByRoute } from "@/lib/telegram/notifications";
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
    .select(
      "id, user_id, account_index, cookies, user_agent, proxy_url, browser_fingerprint, api_key"
    )
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
      let apiKey = (session as { api_key?: string | null }).api_key ?? null;

      // ТЗ §15.9: авто-апгрейд api_key для существующих сессий без relogin'а.
      // Если у активной сессии cookies есть, но api_key нет — пробуем извлечь.
      if (!apiKey && cookies.length > 0) {
        const browserSession: BrowserSession = { cookies, userAgent, proxyUrl, platform };
        const extracted = await fetchAvitoApiKey(browserSession);
        if (extracted) {
          await supabase
            .from("avito_browser_sessions")
            .update({ api_key: extracted })
            .eq("id", session.id);
          apiKey = extracted;
          console.log(
            `[sync-avito-orders] api_key auto-extracted for session ${session.id} (${extracted.slice(0, 8)}…)`
          );
        }
      }

      const { orders } = await fetchAvitoOrders({ cookies, userAgent, proxyUrl, platform, apiKey });

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

        // Для заказов требующих действия (отправить / забрать возврат) —
        // догружаем детали (адрес почты, код, barcode). Avito возвращает их
        // через /web/2/profile/order, мы парсим в delivery_details.
        const detailsMap = new Map<string, Awaited<ReturnType<typeof fetchAvitoOrderDetails>>>();
        const actionOrders = orders.filter((o) => o.status.requiredAction);
        for (const o of actionOrders) {
          try {
            const d = await fetchAvitoOrderDetails({ cookies, userAgent, proxyUrl, platform }, o.orderId);
            if (d) detailsMap.set(o.orderId, d);
            await humanDelay(800, 2000);
          } catch (e) {
            console.warn(`[sync-avito-orders] details fetch failed for ${o.orderId}:`, (e as Error)?.message);
          }
        }

        // Upsert заказов в БД — с session_id + обогащение по ТЗ
        const rows = orders.map((o) => {
          const itemTitle = o.imgSet[0]?.alt ?? null;
          const avitoItemId = linkOrderToItem(itemTitle, itemsList);
          const details = detailsMap.get(o.orderId) ?? null;
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
            delivery_details: details, // адрес почты, код, barcode для активных
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
          // ТЗ §5: дублируем Авито-заказы в общую таблицу orders (source='avito').
          // Это разблокирует отправщика, финансы и аналитику.
          await upsertAvitoOrdersIntoOrdersTable(rows, session.user_id, {
            cookies,
            userAgent,
            proxyUrl,
            platform,
            apiKey,
          }).catch((e) =>
            console.warn("[sync-avito-orders] orders-table sync failed:", e)
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

  for (const [avitoItemId, total] of Array.from(totals.entries())) {
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

/**
 * ТЗ §5: для каждой Авито-строки upsert'им запись в общую таблицу orders
 * с source='avito'. Подтягиваем product_id из avito_item_product_mapping
 * и purchase_price из products.
 */
async function upsertAvitoOrdersIntoOrdersTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  userId: string,
  session: BrowserSession
): Promise<void> {
  if (!rows.length) return;
  const supabase = createServiceClientLoose();

  // Собираем уникальные avito_item_id для batch-lookup mapping'а.
  const itemIds = Array.from(
    new Set(rows.map((r) => r.avito_item_id).filter((x: unknown) => x != null))
  );

  // Карта avito_item_id → {product_id, purchase_price}.
  const mappingByItem = new Map<string, ProductMapping>();
  if (itemIds.length > 0) {
    const { data: mappings } = await supabase
      .from("avito_item_product_mapping")
      .select("avito_item_id, product_id, products(purchase_price)")
      .eq("user_id", userId)
      .in("avito_item_id", itemIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (mappings ?? []) as any[]) {
      // products(...) join возвращает объект или массив; нормализуем.
      const product = Array.isArray(m.products) ? m.products[0] : m.products;
      mappingByItem.set(String(m.avito_item_id), {
        product_id: m.product_id,
        purchase_price: Number(product?.purchase_price ?? 0),
      });
    }
  }

  let synced = 0;
  let unmapped = 0;
  for (const r of rows) {
    const avitoRow: AvitoOrderRow = {
      avito_order_id: String(r.avito_order_id),
      status: r.status ?? null,
      status_label: r.status_label ?? null,
      required_action: !!r.required_action,
      item_title: r.item_title ?? null,
      item_img_url: r.item_img_url ?? null,
      cost_total: r.cost_total != null ? Number(r.cost_total) : null,
      tracking_number: r.tracking_number ?? null,
      delivery_details: r.delivery_details ?? null,
      avito_item_id: r.avito_item_id ?? null,
      created_at_avito: r.created_at_avito ?? null,
      updated_at_avito: r.updated_at_avito ?? null,
    };
    const mapping = r.avito_item_id ? mappingByItem.get(String(r.avito_item_id)) ?? null : null;
    if (!mapping) unmapped++;

    // ТЗ §15.9: дополняем заказ данными BeduinUI endpoint'ов (buyer.name,
    // комиссия, channelId, точные timestamps). Best-effort — если apiKey
    // нет или endpoint вернул null, пишем без них.
    let parsedDetail: ParsedAvitoOrderDetail | null = null;
    let parsedLog: ParsedAvitoOrderLog | null = null;
    if (session.apiKey) {
      try {
        const rawDetail = await fetchAvitoOrderProfileDetail(
          session,
          String(r.avito_order_id)
        );
        if (rawDetail) parsedDetail = parseAvitoOrderDetail(rawDetail);
      } catch (e) {
        console.warn(
          `[sync-avito-orders] profile/order fetch failed for ${r.avito_order_id}:`,
          (e as Error).message
        );
      }
    }
    try {
      const rawLog = await fetchAvitoOrderLog(session, String(r.avito_order_id));
      if (rawLog) parsedLog = parseAvitoOrderLog(rawLog);
    } catch (e) {
      console.warn(
        `[sync-avito-orders] order-log fetch failed for ${r.avito_order_id}:`,
        (e as Error).message
      );
    }

    // ТЗ §15.9: если получили channelId — дополняем avito_orders.delivery_details
    // (там же лежат прочие raw-поля, и findChatForAvitoOrder читает оттуда).
    if (parsedDetail?.channelId && r.avito_order_id) {
      const merged = {
        ...(r.delivery_details ?? {}),
        channelId: parsedDetail.channelId,
      };
      await supabase
        .from("avito_orders")
        .update({ delivery_details: merged })
        .eq("avito_order_id", String(r.avito_order_id))
        .eq("user_id", userId);
    }

    const result = await upsertOrderFromAvito({
      supabase,
      ownerUserId: userId,
      avitoOrder: avitoRow,
      mapping,
      parsedDetail,
      parsedLog,
    });
    if (result) {
      synced++;
      // ТЗ §4.2: новый заказ в awaiting_size с привязанным товаром —
      // запускаем мини-AI запрос размера.
      if (result.isNew && result.status === "awaiting_size" && mapping?.product_id) {
        await scheduleAvitoRequestSize(result.orderId).catch((e) =>
          console.warn(
            `[sync-avito-orders] scheduleAvitoRequestSize failed for ${result.orderId}:`,
            (e as Error).message
          )
        );
      }
      // ТЗ §3.2: новый заказ без mapping → DM владельцу (AI не запускаем,
      // владелец привязывает объявление к товару в UI, потом запускает AI вручную).
      if (result.isNew && !mapping?.product_id) {
        await sendByRoute({
          routeKey: "order_problem",
          message:
            `📦 <b>Новый Avito-заказ</b>\n\n` +
            `Объявление <code>${r.avito_item_id ?? "?"}</code> не привязано к товару.\n` +
            `Открой /owner/avito/items и привяжи — после этого AI спросит размер.`,
        }).catch((e) => console.warn(`[sync-avito-orders] unmapped-DM failed:`, e));
      }
    }
  }
  console.log(
    `[sync-avito-orders] orders-table sync: ${synced}/${rows.length}, unmapped: ${unmapped}`
  );
}
