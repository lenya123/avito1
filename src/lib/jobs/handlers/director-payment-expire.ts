/**
 * Обработчик `director-payment-expire` — через 24 часа после ухода чека
 * директору, если решения нет — auto-cancel pending'а + DM клиенту с
 * объяснением + эскалация владельцу.
 *
 * Идемпотентно: если pending уже снят — ничего не делает.
 */

import type { Job } from "bullmq";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { notifyCustomerOrderCancelled, sendOwnerEscalation } from "@/lib/telegram/notifications";
import type { DirectorPaymentExpireJobData } from "../queues";

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Чистая функция: сценарий «директор молчит 24h» — cancel + DM + escalation.
 * Вызывается из BullMQ-handler'а и из periodic sweep'а (backup).
 *
 * Идемпотентно: если pending уже отсутствует или partner-warehouse — skip.
 */
export async function directorPaymentExpireCore(
  pendingOrderId: string,
  client?: SupabaseClient
): Promise<{ cancelled: boolean }> {
  const supabase = client ?? getServiceClient();

  const { data: pending } = await supabase
    .from("pending_orders")
    .select("id, order_number, customer_id, source_kind, source_warehouse, source_partner_id")
    .eq("id", pendingOrderId)
    .maybeSingle();

  if (!pending) {
    return { cancelled: false };
  }
  // partner-warehouse-pending'и обрабатываются партнёром через partner-bot,
  // их 24h-expire живёт отдельно (partner-payment-expire). Сюда такие
  // pending'и не должны попадать, защита на всякий случай.
  if (pending.source_warehouse === "partner") {
    return { cancelled: false };
  }

  const { data: cancelled, error: cancelErr } = await supabase
    .rpc("cancel_pending_order_atomic", { p_pending_order_id: pendingOrderId })
    .single();
  if (cancelErr) {
    console.error("[director-payment-expire] cancel_pending_order_atomic failed:", cancelErr);
    throw cancelErr;
  }
  if (!cancelled) {
    return { cancelled: false };
  }

  const { data: settings } = await supabase
    .from("business_settings")
    .select("support_telegram_username, director_tg_username")
    .limit(1)
    .maybeSingle();

  const supportRaw =
    (settings?.support_telegram_username as string | null) ||
    (settings?.director_tg_username as string | null) ||
    null;
  const supportLine = supportRaw ? `@${supportRaw.replace(/^@/, "")}` : "поддержку";

  if (pending.customer_id) {
    await notifyCustomerOrderCancelled({
      customerId: pending.customer_id,
      orderId: pendingOrderId,
      orderNumber: Number(pending.order_number),
      reason: `чек так и не подтвердили за сутки. Если деньги ушли — пиши ${supportLine}, разберёмся.`,
    }).catch((e) => console.error("[director-payment-expire] notify customer failed:", e));
  }

  await sendOwnerEscalation({
    title: `Директор молчит 24ч — №${pending.order_number}`,
    message:
      `⚠️ По заказу №${pending.order_number} чек ушёл директору на ручную проверку, ` +
      `решения нет 24 часа. Заказ авто-отменён, клиенту отправлено уведомление. ` +
      `Если оплата реально была — нужно разобраться вручную.`,
  }).catch((e) => console.error("[director-payment-expire] escalate failed:", e));

  return { cancelled: true };
}

export async function handleDirectorPaymentExpire(
  job: Job<DirectorPaymentExpireJobData>
): Promise<void> {
  const { pendingOrderId } = job.data;
  console.log(`[director-payment-expire] Processing pending ${pendingOrderId}`);
  const result = await directorPaymentExpireCore(pendingOrderId);
  if (result.cancelled) {
    console.log(
      `[director-payment-expire] Pending ${pendingOrderId} cancelled (director silent 24h)`
    );
  } else {
    console.log(`[director-payment-expire] Pending ${pendingOrderId} skipped`);
  }
}
