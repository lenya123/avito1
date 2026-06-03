/**
 * Обработчик: обычный (не-+ВАЙБ) заказ висит больше 10 минут без чека —
 * авто-cancel.
 *
 * BUSINESS_LOGIC §4.5: если клиент оформил заказ и не прислал фото чека
 * за 10 минут, заказ обнуляется, чтобы не блокировать сток. +ВАЙБ-заказы
 * под этот таймер не попадают (для них долг — норма).
 *
 * Идемпотентно:
 *  - если заказ уже не в статусе `paid` / `is_paid=false` — выходим;
 *  - если клиент уже прислал чек (есть запись в `order_messages` с
 *    `kind='receipt'` и `direction='inbound'`) — оставляем заказ как есть,
 *    дальнейшая судьба определяется Vision auto-confirm / партнёром /
 *    владельцем.
 */

import { Job } from "bullmq";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { appendStatusHistory } from "@/lib/orders/status-history";
import { notifyCustomerOrderCancelled } from "@/lib/telegram/notifications";
import type { ExpireUnpaidOrderJobData } from "../queues";

function getServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

/**
 * Чистая функция: cancel заказа если за 10 мин не пришёл чек.
 * Вызывается из BullMQ-handler'а и из periodic sweep'а.
 *
 * Идемпотентно: повторный вызов на уже отменённом / оплаченном заказе
 * — no-op. UPDATE с фильтром `status='paid' AND is_paid=false` гарантирует
 * что только один параллельный вызов реально cancel'нет.
 */
export async function expireUnpaidOrderCore(
  orderId: string,
  client?: SupabaseClient
): Promise<{ cancelled: boolean }> {
  const supabase = client ?? getServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, is_paid, status_history, product_size_id, customer_id, partner_id"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error(`[expire-unpaid-order] Lookup failed for ${orderId}:`, error);
    throw error;
  }
  if (!order) {
    return { cancelled: false };
  }
  if (order.status !== "paid" || order.is_paid) {
    return { cancelled: false };
  }

  // Если клиент уже прислал чек — таймер не должен auto-cancel'ить.
  // Канон: после получения чека судьба заказа решается Vision / партнёром / владельцем.
  const { data: receiptMsg } = await supabase
    .from("order_messages")
    .select("id")
    .eq("order_id", orderId)
    .eq("kind", "receipt")
    .eq("direction", "inbound")
    .limit(1)
    .maybeSingle();

  if (receiptMsg) {
    return { cancelled: false };
  }

  const { error: updateError, count } = await supabase
    .from("orders")
    .update(
      {
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "unpaid_timeout",
        status_history: appendStatusHistory(order.status_history, "cancelled"),
      },
      { count: "exact" }
    )
    .eq("id", orderId)
    .eq("status", "paid")
    .eq("is_paid", false);

  if (updateError) {
    console.error(`[expire-unpaid-order] Update failed for ${orderId}:`, updateError);
    throw updateError;
  }

  // Если другая транзакция уже cancel'нула — выходим без побочных эффектов.
  if (!count) {
    return { cancelled: false };
  }

  // current_quantity вернёт триггер update_product_quantity_on_order
  // на UPDATE статуса. reserved_quantity уже снят при создании orders
  // (create_order_atomic после миграции 20260501000020).

  // DM клиенту с дружелюбным объяснением и ссылкой на поддержку.
  if (order.customer_id) {
    const { data: settings } = await supabase
      .from("business_settings")
      .select("support_telegram_username")
      .limit(1)
      .maybeSingle();

    const supportUsername = settings?.support_telegram_username
      ? `@${String(settings.support_telegram_username).replace(/^@/, "")}`
      : "нашу поддержку";

    await notifyCustomerOrderCancelled({
      customerId: order.customer_id,
      orderId,
      orderNumber: order.order_number,
      reason: `оплата не пришла за 10 минут. Если перевёл — пиши ${supportUsername}, разберёмся.`,
    }).catch((e) => console.error("[expire-unpaid-order] notify failed:", e));
  }

  return { cancelled: true };
}

export async function handleExpireUnpaidOrder(job: Job<ExpireUnpaidOrderJobData>): Promise<void> {
  const { orderId } = job.data;
  console.log(`[expire-unpaid-order] Processing order ${orderId}`);

  const result = await expireUnpaidOrderCore(orderId);
  if (result.cancelled) {
    console.log(`[expire-unpaid-order] Order ${orderId} → cancelled (unpaid timeout)`);
  } else {
    console.log(`[expire-unpaid-order] Order ${orderId} — skip (already settled / has receipt)`);
  }
}
