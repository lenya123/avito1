/**
 * Обработчик `partner-payment-expire` — auto-cancel партнёрского заказа,
 * если за 24ч после получения чека партнёр не подтвердил оплату текстом
 * «N да» или «N нет».
 *
 * Окно работы партнёра при cancel НЕ учитывается — это эскалация, а не
 * уведомление. Уведомление клиенту и эскалация директору в
 * `support_telegram_username` шлются сразу.
 *
 * Идемпотентно: если заказ уже не в подвешенном состоянии, ничего не
 * делает.
 */

import { Job } from "bullmq";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { appendStatusHistory } from "@/lib/orders/status-history";
import { notifyCustomerOrderCancelled } from "@/lib/telegram/notifications";
import type { PartnerPaymentExpireJobData } from "../queues";

function getServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

export async function handlePartnerPaymentExpire(
  job: Job<PartnerPaymentExpireJobData>
): Promise<void> {
  const { orderId } = job.data;
  const supabase = getServiceClient();

  console.log(`[partner-payment-expire] Processing order ${orderId}`);

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, is_paid, status_history, customer_id, partner_id, product_size_id"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    console.log(`[partner-payment-expire] Order ${orderId} not found — skip`);
    return;
  }

  if (order.status !== "paid" || order.is_paid) {
    console.log(
      `[partner-payment-expire] Order ${orderId} status=${order.status} is_paid=${order.is_paid} — skip`
    );
    return;
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: "partner_silent_24h",
      status_history: appendStatusHistory(order.status_history, "cancelled"),
    })
    .eq("id", orderId)
    .eq("status", "paid")
    .eq("is_paid", false);

  if (updateError) {
    console.error(`[partner-payment-expire] Update failed for ${orderId}:`, updateError);
    throw updateError;
  }

  // current_quantity вернёт триггер update_product_quantity_on_order
  // на UPDATE статуса. reserved_quantity уже снят при создании orders
  // (create_order_atomic после миграции 20260501000020).

  // Контакты партнёра и поддержки.
  const [{ data: partner }, { data: settings }] = await Promise.all([
    order.partner_id
      ? supabase
          .from("partners")
          .select("name, tg_username")
          .eq("id", order.partner_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("business_settings").select("support_telegram_username").limit(1).maybeSingle(),
  ]);

  const supportLine = settings?.support_telegram_username
    ? `@${String(settings.support_telegram_username).replace(/^@/, "")}`
    : "нашу поддержку";
  const partnerLine = partner?.tg_username ? `@${partner.tg_username}` : null;

  // Клиент.
  if (order.customer_id) {
    const reasonForCustomer = partnerLine
      ? `партнёр не подтвердил оплату за сутки. Если деньги ушли — пиши ${supportLine}, разберёмся. Контакт партнёра: ${partnerLine}.`
      : `партнёр не подтвердил оплату за сутки. Если деньги ушли — пиши ${supportLine}, разберёмся.`;
    await notifyCustomerOrderCancelled({
      customerId: order.customer_id,
      orderId,
      orderNumber: order.order_number,
      reason: reasonForCustomer,
    }).catch((e) => console.error("[partner-payment-expire] notify customer failed:", e));
  }

  // Эскалация — операционная задача (заказ клиента отменён по таймауту партнёра).
  // Идёт директору через notifyOwnerOrderProblem-аналог; владелец не получает
  // (он не контактирует с клиентами).
  const { sendDirectorEscalation } = await import("@/lib/telegram/notifications");
  await sendDirectorEscalation({
    title: `Партнёр молчит 24ч — №${order.order_number}`,
    message:
      `⚠️ Партнёр ${partnerLine ?? "(без TG)"} не подтвердил оплату по заказу №${order.order_number} за 24 часа.\n\n` +
      `Заказ отменён, клиенту отправлено уведомление.\n` +
      `Если клиент уже перевёл — нужно разобраться: списать у партнёра или вернуть клиенту.`,
  }).catch((e) => console.error("[partner-payment-expire] escalate failed:", e));

  console.log(`[partner-payment-expire] Order ${orderId} → cancelled (partner silent 24h)`);
}
