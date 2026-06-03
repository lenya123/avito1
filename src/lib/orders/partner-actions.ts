/**
 * Действия партнёра над своим заказом из partner-bot (Phase G.5, 2026-05-26).
 *
 * Покрывает только `source_warehouse='partner'` — заказы, где товар
 * физически у партнёра и отгружает он сам. Для партнёрских с
 * `source_warehouse='owner'` (партнёрский товар лежит у нас) отгружает
 * наш shipper через PWA, партнёр в них только наблюдатель.
 *
 * Здесь — минимальный набор: paid → sent (отправил), return → return_done
 * (забрал возврат), paid → cancelled (нет товара/размера у партнёра).
 * Симметрично shipper-actions, но без shipper-specific логики
 * (claimed_by, shipper_rate_snapshot, adjustActualStock, increment_shipper_stat).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendStatusHistory } from "@/lib/orders/status-history";
import {
  notifyCustomerOrderShipped,
  notifyCustomerOrderCancelled,
  notifyCustomerOrderReturnPickedUp,
  notifyPartnerOrderRefundDue,
} from "@/lib/telegram/notifications";
import { resolvePartnerRefundContext } from "@/lib/orders/partner-refund-context";
import { editOrderSummary, buildSummaryFromOrderId } from "@/lib/telegram/orders-group";
import { cancelMoveToTrash } from "@/lib/jobs";
import type { Database, Json } from "@/types/database.generated";

type Supabase = SupabaseClient<Database>;

export type PartnerOrderForAction = {
  id: string;
  status: string | null;
  status_history: Json | null;
  order_number: number;
  partner_id: string | null;
  customer_id: string | null;
  product_id: string | null;
  product_size_id: string | null;
  source_warehouse: string | null;
  client_price: number;
  is_paid: boolean;
  tracking_number: string | null;
  delivery_service: string | null;
};

export type PartnerActionResult = { success: true } | { success: false; error: string };

function ensurePartnerWarehouse(order: PartnerOrderForAction, partnerId: string): string | null {
  if (order.partner_id !== partnerId) return "Заказ не принадлежит тебе.";
  if (order.source_warehouse !== "partner") {
    return "Этот заказ отгружает владелец — тебе ничего делать не нужно.";
  }
  return null;
}

/**
 * Партнёр отправил заказ клиенту физически. paid → sent.
 *
 * Не пишет shipped_by (нет shipper'a), не дёргает shipper-stats,
 * не вычисляет shipper_rate_snapshot (БД-триггер сам поставит NULL
 * для партнёрских самоотгрузочных заказов — у них нет shipper'a в системе выплат).
 */
export async function executePartnerMarkSent(
  supabase: Supabase,
  order: PartnerOrderForAction,
  partnerId: string
): Promise<PartnerActionResult> {
  const partnerCheck = ensurePartnerWarehouse(order, partnerId);
  if (partnerCheck) return { success: false, error: partnerCheck };

  if (order.status !== "paid") {
    return { success: false, error: "Заказ уже не в статусе «ожидает отправки»." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "sent",
      shipped_at: now,
      status_history: appendStatusHistory(order.status_history, "sent"),
    })
    .eq("id", order.id)
    .eq("status", "paid");

  if (error) return { success: false, error: error.message };

  if (order.customer_id) {
    notifyCustomerOrderShipped({
      customerId: order.customer_id,
      orderId: order.id,
      orderNumber: order.order_number,
      trackingNumber: order.tracking_number,
      deliveryService: order.delivery_service,
    }).catch((e) => console.error("[partner-actions] notifyCustomerOrderShipped failed:", e));
  }

  buildSummaryFromOrderId(order.id)
    .then((summary) => (summary ? editOrderSummary(summary) : undefined))
    .catch((e) => console.error("[partner-actions] editOrderSummary (ship) failed:", e));

  return { success: true };
}

/**
 * Партнёр забрал возврат с ПВЗ. return → return_done.
 *
 * Триггер `auto_credit_customer_balance` skip'нет credit для partner_id
 * (канон §10.3) — деньги у партнёра, он возвращает напрямую. Шлём DM
 * клиенту с контактом партнёра и DM партнёру с контактом клиента
 * (как при shipper-flow через executeCompleteReturn).
 *
 * `scheduleAutoResumeProblem` не зовём — товар уехал к партнёру, а не на
 * наш склад. Возможные problem-заказы на этот product_size_id ждут
 * партнёрских пополнений (которых у нас в системе нет).
 */
export async function executePartnerMarkReturnPicked(
  supabase: Supabase,
  order: PartnerOrderForAction,
  partnerId: string
): Promise<PartnerActionResult> {
  const partnerCheck = ensurePartnerWarehouse(order, partnerId);
  if (partnerCheck) return { success: false, error: partnerCheck };

  if (order.status !== "return") {
    return { success: false, error: "Возврат уже не активен." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "return_done",
      return_completed_at: now,
      status_history: appendStatusHistory(order.status_history, "return_done"),
    })
    .eq("id", order.id)
    .eq("status", "return");

  if (error) return { success: false, error: error.message };

  cancelMoveToTrash(order.id).catch((e) =>
    console.error("[partner-actions] cancelMoveToTrash failed:", e)
  );

  // DM-ветка — если был оплачен (на партнёрских это всегда true для return_done,
  // но проверяем для надёжности на случай легаси).
  if (order.customer_id && order.is_paid && order.client_price > 0 && order.partner_id) {
    const ctx = await resolvePartnerRefundContext(supabase, order.partner_id, order.customer_id);
    if (ctx) {
      notifyCustomerOrderReturnPickedUp({
        customerId: order.customer_id,
        orderId: order.id,
        orderNumber: order.order_number,
        partnerRefund: {
          partnerLabel: ctx.partnerLabel,
          supportUsername: ctx.supportUsername,
          amount: order.client_price,
        },
      }).catch((e) =>
        console.error("[partner-actions] notifyCustomerOrderReturnPickedUp failed:", e)
      );
      notifyPartnerOrderRefundDue({
        partnerId: order.partner_id,
        orderNumber: order.order_number,
        amount: order.client_price,
        customerLabel: ctx.customerLabel,
        supportUsername: ctx.supportUsername,
        kind: "return_done",
      }).catch((e) => console.error("[partner-actions] notifyPartnerOrderRefundDue failed:", e));
    }
  }

  return { success: true };
}

/**
 * Партнёр на этапе отправки понял, что нет размера или вообще нет товара.
 * Заказ → cancelled, клиенту DM с контактом партнёра (деньги обсуждать
 * напрямую — они уже у партнёра), партнёру DM-инструкция.
 *
 * `kind='size'` обнуляет `current_quantity` на конкретном размере;
 * `kind='product'` снимает товар с продажи целиком (`is_in_stock=false`).
 */
export async function executePartnerCancelNoStock(
  supabase: Supabase,
  order: PartnerOrderForAction,
  partnerId: string,
  kind: "size" | "product"
): Promise<PartnerActionResult> {
  const partnerCheck = ensurePartnerWarehouse(order, partnerId);
  if (partnerCheck) return { success: false, error: partnerCheck };

  if (order.status !== "paid") {
    return { success: false, error: "Заказ уже не в статусе «ожидает отправки»." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancel_reason: kind === "size" ? "partner_size_out" : "partner_product_out",
      status_history: appendStatusHistory(order.status_history, "cancelled", {
        from: order.status,
        reason: kind === "size" ? "partner_size_out" : "partner_product_out",
      }),
    })
    .eq("id", order.id)
    .eq("status", "paid");

  if (error) return { success: false, error: error.message };

  // Снимаем размер/товар с продажи — у партнёра физически нет.
  if (kind === "size" && order.product_size_id) {
    await supabase
      .from("product_sizes")
      .update({ current_quantity: 0 })
      .eq("id", order.product_size_id)
      .gt("current_quantity", 0);
  } else if (kind === "product" && order.product_id) {
    await supabase.from("products").update({ is_in_stock: false }).eq("id", order.product_id);
  }

  // DM-ветка для оплаченных заказов (для +ВАЙБ-долговых is_paid=false —
  // деньги не пришли, но клиента всё равно уведомляем об отмене).
  if (order.customer_id && order.partner_id) {
    const reasonWord = kind === "size" ? "размер" : "товар";

    if (order.is_paid && order.client_price > 0) {
      const ctx = await resolvePartnerRefundContext(supabase, order.partner_id, order.customer_id);
      if (ctx) {
        notifyCustomerOrderCancelled({
          customerId: order.customer_id,
          orderId: order.id,
          orderNumber: order.order_number,
          reason: `${reasonWord} закончился у партнёра`,
          partnerRefund: {
            partnerLabel: ctx.partnerLabel,
            supportUsername: ctx.supportUsername,
            amount: order.client_price,
          },
        }).catch((e) => console.error("[partner-actions] notifyCustomerOrderCancelled failed:", e));
        notifyPartnerOrderRefundDue({
          partnerId: order.partner_id,
          orderNumber: order.order_number,
          amount: order.client_price,
          customerLabel: ctx.customerLabel,
          supportUsername: ctx.supportUsername,
          kind: "cancelled",
        }).catch((e) => console.error("[partner-actions] notifyPartnerOrderRefundDue failed:", e));
      } else {
        notifyCustomerOrderCancelled({
          customerId: order.customer_id,
          orderId: order.id,
          orderNumber: order.order_number,
          reason: `${reasonWord} закончился у партнёра`,
        }).catch((e) => console.error("[partner-actions] notifyCustomerOrderCancelled failed:", e));
      }
    } else {
      // +ВАЙБ-долговый или legacy не-оплаченный: возвращать нечего, просто DM.
      notifyCustomerOrderCancelled({
        customerId: order.customer_id,
        orderId: order.id,
        orderNumber: order.order_number,
        reason: `${reasonWord} закончился у партнёра`,
      }).catch((e) => console.error("[partner-actions] notifyCustomerOrderCancelled failed:", e));
    }
  }

  buildSummaryFromOrderId(order.id)
    .then((summary) => (summary ? editOrderSummary(summary) : undefined))
    .catch((e) => console.error("[partner-actions] editOrderSummary (cancel) failed:", e));

  return { success: true };
}
