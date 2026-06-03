/**
 * Handler `expire-pending-order` — TTL pending_orders истёк, чек не пришёл.
 *
 * Через 10 мин после wizard-confirm не-+ВАЙБ заказа: если pending_orders
 * запись ещё на месте (клиент не прислал чек / партнёр не подтвердил),
 * — удаляем её и декрементим reserved_quantity. DM клиенту.
 *
 * Идемпотентно: cancel_pending_order_atomic возвращает FALSE если pending
 * уже удалён (подтверждён, отменён, ранее снят).
 *
 * Backup механизм — `sweepExpiredPendingOrders` в sweep-expired-orders.ts,
 * подбирает pending'и с истёкшим expires_at каждую минуту.
 */
import { Job } from "bullmq";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { notifyCustomerOrderCancelled } from "@/lib/telegram/notifications";
import type { ExpirePendingOrderJobData } from "../queues";

function getServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

/**
 * Чистая функция: cancel_pending_order_atomic + DM клиенту.
 * Вызывается из BullMQ-handler'а и из periodic sweep'а.
 */
export async function expirePendingOrderCore(
  pendingOrderId: string,
  client?: SupabaseClient
): Promise<{ cancelled: boolean }> {
  const supabase = client ?? getServiceClient();

  // Если чек уже получен (receipt_received_at NOT NULL) — ждём решения
  // Vision/партнёра/owner. Не cancel'им автоматически.
  const { data: pending } = await supabase
    .from("pending_orders")
    .select("id, order_number, customer_id, partner_id, receipt_received_at")
    .eq("id", pendingOrderId)
    .maybeSingle();

  if (!pending) {
    return { cancelled: false };
  }
  if (pending.receipt_received_at) {
    // Чек уже на руках — таймер не должен сносить заказ.
    // Партнёрский subflow держит свои таймеры (6ч/24ч).
    return { cancelled: false };
  }

  const { data: result, error } = await supabase
    .rpc("cancel_pending_order_atomic", { p_pending_order_id: pendingOrderId })
    .single();

  if (error) {
    console.error(`[expire-pending-order] cancel_pending_order_atomic failed:`, error);
    throw error;
  }

  if (!result) {
    return { cancelled: false };
  }

  if (pending.customer_id) {
    const { data: settings } = await supabase
      .from("business_settings")
      .select("support_telegram_username")
      .limit(1)
      .maybeSingle();

    const supportUsername = settings?.support_telegram_username
      ? `@${String(settings.support_telegram_username).replace(/^@/, "")}`
      : "нашу поддержку";

    await notifyCustomerOrderCancelled({
      customerId: pending.customer_id,
      orderId: pendingOrderId,
      orderNumber: Number(pending.order_number ?? 0),
      reason: `время на оплату истекло. Если перевёл — пиши ${supportUsername}, разберёмся.`,
    }).catch((e) => console.error("[expire-pending-order] notify failed:", e));
  }

  return { cancelled: true };
}

export async function handleExpirePendingOrder(job: Job<ExpirePendingOrderJobData>): Promise<void> {
  const { pendingOrderId } = job.data;
  console.log(`[expire-pending-order] Processing pending ${pendingOrderId}`);

  const result = await expirePendingOrderCore(pendingOrderId);
  if (result.cancelled) {
    console.log(`[expire-pending-order] Pending ${pendingOrderId} cancelled (TTL expired)`);
  } else {
    console.log(
      `[expire-pending-order] Pending ${pendingOrderId} skipped (already gone / has receipt)`
    );
  }
}
