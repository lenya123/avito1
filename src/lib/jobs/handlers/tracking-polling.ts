/**
 * Polling статусов доставки через Track.global API
 *
 * Запускается раз в час для проверки статусов заказов
 * со статусами in_transit и return_in_transit
 *
 * Yandex/Avito-заказы исключаются — управляются вручную.
 *
 * Лимиты Track.global (Pro):
 * - 5000 запросов в месяц
 * - 5 запросов в секунду
 */

import { Job } from "bullmq";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createDeliveryClient } from "@/lib/delivery";
import { isTrackableService } from "@/lib/delivery/types";
import { isValidTransition } from "@/lib/orders/transitions";
import { appendStatusHistory } from "@/lib/orders/status-history";
import { processReferralBonus } from "@/lib/orders/referral-bonus";
import { cancelReturnArrived, scheduleMoveToTrash } from "../queues";
import type { OrderStatus } from "@/types/database";

// Статусы заказов, которые нужно отслеживать
const TRACKABLE_STATUSES = ["in_transit", "return_in_transit"];

// Rate limit: 5 req/sec → 200ms + запас
const REQUEST_DELAY_MS = 250;

interface TrackedOrder {
  id: string;
  tracking_number: string | null;
  delivery_service: string;
  status: string;
  status_history: Array<{ status: string; timestamp: string }> | null;
  client_id: string;
  order_number: number;
  client_price: number;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleTrackingPolling(_job: Job): Promise<void> {
  const rapidApiKey = process.env.TRACK_GLOBAL_RAPIDAPI_KEY;
  const bearerToken = process.env.TRACK_GLOBAL_BEARER_TOKEN;

  if (!rapidApiKey || !bearerToken) {
    console.warn("[tracking-polling] Track.global keys not set, skipping");
    return;
  }

  const supabase = getServiceClient();
  const deliveryClient = createDeliveryClient();

  console.log("[tracking-polling] Starting...");

  // Получить заказы для отслеживания (исключая Yandex и Avito)
  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, tracking_number, delivery_service, status, status_history, client_id, order_number, client_price"
    )
    .in("status", TRACKABLE_STATUSES)
    .not("tracking_number", "is", null)
    .neq("delivery_service", "yandex")
    .neq("delivery_service", "avito")
    .limit(100);

  if (error) {
    console.error("[tracking-polling] Failed to fetch orders:", error);
    throw error;
  }

  if (!orders?.length) {
    console.log("[tracking-polling] No orders to track");
    return;
  }

  // Дополнительная фильтрация — только поддерживаемые службы
  const trackableOrders = orders.filter((o) => isTrackableService(o.delivery_service));

  if (!trackableOrders.length) {
    console.log("[tracking-polling] No trackable orders (all non-supported services)");
    return;
  }

  console.log(`[tracking-polling] Tracking ${trackableOrders.length} orders`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;
  let invalid = 0;

  for (const order of trackableOrders as TrackedOrder[]) {
    try {
      const result = await deliveryClient.getStatus(order.tracking_number!);

      if (!result.success || !result.data) {
        console.warn(
          `[tracking-polling] Failed to get status for #${order.order_number}: ${result.error}`
        );
        failed++;
        await delay(REQUEST_DELAY_MS);
        continue;
      }

      const newStatus = result.data.mappedStatus;

      // Если статус не изменился — пропускаем
      if (order.status === newStatus) {
        skipped++;
        await delay(REQUEST_DELAY_MS);
        continue;
      }

      // Валидация перехода — статус только вперёд
      if (!isValidTransition(order.status as OrderStatus, newStatus)) {
        console.warn(
          `[tracking-polling] Invalid transition for #${order.order_number}: ${order.status} → ${newStatus}, skipping`
        );
        invalid++;
        await delay(REQUEST_DELAY_MS);
        continue;
      }

      console.log(
        `[tracking-polling] Order #${order.order_number}: ${order.status} → ${newStatus}`
      );

      // Подготовить данные для обновления
      const updateData: Record<string, unknown> = {
        status: newStatus,
        status_history: appendStatusHistory(order.status_history, newStatus),
        updated_at: new Date().toISOString(),
      };

      // Дополнительные поля в зависимости от нового статуса
      if (newStatus === "completed") {
        updateData.completed_at = new Date().toISOString();
      }
      if (newStatus === "return_arrived") {
        updateData.return_arrived_at = new Date().toISOString();
      }

      // Обновить заказ
      const { error: updateError } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", order.id);

      if (updateError) {
        console.error(
          `[tracking-polling] Failed to update order #${order.order_number}:`,
          updateError
        );
        failed++;
        await delay(REQUEST_DELAY_MS);
        continue;
      }

      // Side-effects по статусу
      await processStatusSideEffects(supabase, order, newStatus);

      // Activity log
      await supabase
        .from("activity_log")
        .insert({
          user_id: order.client_id,
          action: "order_auto_status_update",
          entity_type: "order",
          entity_id: order.id,
          details: {
            from_status: order.status,
            to_status: newStatus,
            source: "tracking_polling",
          },
        })
        .then(
          () => {},
          (err) => console.error("[tracking-polling] Activity log error:", err)
        );

      updated++;
      await delay(REQUEST_DELAY_MS);
    } catch (err) {
      console.error(`[tracking-polling] Error processing order #${order.order_number}:`, err);
      failed++;
      await delay(REQUEST_DELAY_MS);
    }
  }

  console.log(
    `[tracking-polling] Done: ${updated} updated, ${skipped} skipped, ${invalid} invalid, ${failed} failed`
  );
}

/**
 * Side-effects при автоматическом изменении статуса.
 * Все вызовы в .catch() — ошибка не блокирует обновление.
 */
async function processStatusSideEffects(
  supabase: SupabaseClient,
  order: TrackedOrder,
  newStatus: OrderStatus
): Promise<void> {
  switch (newStatus) {
    case "completed":
      // Реферальные бонусы
      await processReferralBonus(supabase, order.client_id, order.client_price).catch((err) =>
        console.error(`[tracking-polling] Referral bonus error for #${order.order_number}:`, err)
      );
      break;

    case "return_arrived": {
      // Отменить таймер return-arrived (трекинг определил раньше)
      await cancelReturnArrived(order.id).catch((err) =>
        console.error(
          `[tracking-polling] Cancel return-arrived error for #${order.order_number}:`,
          err
        )
      );
      // Страховочный таймер утиля — 14 дней.
      // Если трекинг определит expired раньше — переведёт в trash напрямую.
      const trashDelayDays = 14;
      await scheduleMoveToTrash(order.id, trashDelayDays).catch((err) =>
        console.error(`[tracking-polling] Schedule trash error for #${order.order_number}:`, err)
      );
      // Сохраняем дедлайн утиля
      const trashDeadline = new Date();
      trashDeadline.setDate(trashDeadline.getDate() + trashDelayDays);
      await supabase
        .from("orders")
        .update({ trash_deadline: trashDeadline.toISOString() })
        .eq("id", order.id)
        .then(
          () => {},
          (err) => console.error(`[tracking-polling] Save trash_deadline error:`, err)
        );
      break;
    }

    case "trash":
      // Трекинг видит expired/unclaimed — статус уже обновлён выше
      console.log(
        `[tracking-polling] Order #${order.order_number} moved to trash by tracking (expired/unclaimed)`
      );
      break;

    case "problem":
      console.log(
        `[tracking-polling] Order #${order.order_number} has a problem detected by tracking`
      );
      break;
  }
}
