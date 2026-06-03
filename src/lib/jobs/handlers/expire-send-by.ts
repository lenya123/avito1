/**
 * Обработчик: send_by сгорел → заказ → cancelled.
 *
 * BUSINESS_LOGIC.md §4.5:
 *   Сгорание send_by → статус cancelled, баланс клиента пополняется
 *   (если заказ был оплачен).
 *
 * Триггер: запланирован при создании заказа на конец дня send_by (23:59:59 МСК).
 * Если к этому моменту статус уже sent / return / return_done / cancelled / trash —
 * job ничего не делает (idempotent).
 */

import { Job } from "bullmq";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { appendStatusHistory } from "@/lib/orders/status-history";
import { moscowEndOfDay } from "@/lib/utils/moscow-time";
import {
  notifyCustomerOrderCancelled,
  notifyPartnerOrderRefundDue,
} from "@/lib/telegram/notifications";
import { resolvePartnerRefundContext } from "@/lib/orders/partner-refund-context";

export interface ExpireSendByJobData {
  orderId: string;
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

const ACTIVE_PRE_SHIPMENT = ["paid", "collecting", "problem"];

/**
 * Чистая функция отмены по сгоревшему send_by. Используется и из BullMQ
 * handler'а, и из периодического sweep'а — поведение единое и идемпотентное.
 */
export async function expireSendByCore(
  orderId: string,
  supabase: SupabaseClient
): Promise<{ cancelled: boolean }> {
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, status_history, send_by, is_paid, customer_id, client_price, partner_id, source_partner_id"
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    console.error(`[expire-send-by] Order ${orderId} not found:`, error);
    return { cancelled: false };
  }

  if (!ACTIVE_PRE_SHIPMENT.includes(order.status)) {
    return { cancelled: false };
  }

  if (order.send_by && Date.now() < moscowEndOfDay(order.send_by).getTime()) {
    return { cancelled: false };
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: "send_by_expired",
      status_history: appendStatusHistory(order.status_history, "cancelled"),
    })
    .eq("id", orderId)
    .in("status", ACTIVE_PRE_SHIPMENT);

  if (updateError) {
    console.error(`[expire-send-by] Update failed for ${orderId}:`, updateError);
    throw updateError;
  }

  console.log(`[expire-send-by] Order ${orderId} → cancelled (send_by expired)`);

  // Refund на customer_balance (BUSINESS_LOGIC §4.5 + §9.2). Только для
  // owner-source оплаченных заказов. Партнёрские деньги возвращает партнёр.
  // RPC идемпотентна — повторный вызов с тем же (order_id, reason) — no-op.
  const partnerId = order.partner_id ?? order.source_partner_id ?? null;
  const isPartnerOrder = !!partnerId;
  if (order.is_paid && order.customer_id && (order.client_price ?? 0) > 0 && !isPartnerOrder) {
    const { error: creditError } = await supabase.rpc("credit_customer_for_order", {
      p_customer_id: order.customer_id,
      p_amount: order.client_price,
      p_order_id: order.id,
      p_reason: "send_by_expired",
    });
    if (creditError) {
      console.error(
        `[expire-send-by] credit_customer_for_order failed for ${orderId}:`,
        creditError
      );
    }
  }

  // DM-цепочка (раньше отсутствовала — клиент узнавал только в боте).
  // Канон 2026-05-26: при сгорании срока шлём клиенту понятный текст.
  // Для партнёрских — отдельная ветка с контактом партнёра + DM партнёру
  // с инструкцией вернуть деньги (симметрично cancelOrderNoReturn).
  if (order.customer_id) {
    if (isPartnerOrder && partnerId && order.is_paid && (order.client_price ?? 0) > 0) {
      const ctx = await resolvePartnerRefundContext(supabase, partnerId, order.customer_id);
      if (ctx) {
        notifyCustomerOrderCancelled({
          customerId: order.customer_id,
          orderId: order.id,
          orderNumber: order.order_number,
          reason: "истёк срок отправки",
          partnerRefund: {
            partnerLabel: ctx.partnerLabel,
            supportUsername: ctx.supportUsername,
            amount: order.client_price,
          },
        }).catch((e) => console.error("[expire-send-by] notifyCustomerOrderCancelled failed:", e));
        notifyPartnerOrderRefundDue({
          partnerId,
          orderNumber: order.order_number,
          amount: order.client_price,
          customerLabel: ctx.customerLabel,
          supportUsername: ctx.supportUsername,
          kind: "cancelled",
        }).catch((e) => console.error("[expire-send-by] notifyPartnerOrderRefundDue failed:", e));
      } else {
        notifyCustomerOrderCancelled({
          customerId: order.customer_id,
          orderId: order.id,
          orderNumber: order.order_number,
          reason: "истёк срок отправки",
        }).catch((e) => console.error("[expire-send-by] notifyCustomerOrderCancelled failed:", e));
      }
    } else {
      // Owner-source или не-оплаченный (+ВАЙБ-долг / legacy):
      // деньги вернулись на баланс (или их и не было) — простая DM.
      const reason = order.is_paid
        ? "истёк срок отправки. Деньги вернулись на твой баланс."
        : "истёк срок отправки";
      notifyCustomerOrderCancelled({
        customerId: order.customer_id,
        orderId: order.id,
        orderNumber: order.order_number,
        reason,
      }).catch((e) => console.error("[expire-send-by] notifyCustomerOrderCancelled failed:", e));
    }
  }

  return { cancelled: true };
}

export async function handleExpireSendBy(job: Job<ExpireSendByJobData>): Promise<void> {
  const { orderId } = job.data;
  const supabase = getServiceClient();
  console.log(`[expire-send-by] Processing order ${orderId}`);
  await expireSendByCore(orderId, supabase);
}
