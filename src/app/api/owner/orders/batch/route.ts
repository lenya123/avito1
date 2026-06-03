import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { validateTransition, ALL_STATUSES } from "@/lib/orders/transitions";
import { appendStatusHistory } from "@/lib/orders/status-history";
import {
  notifyCustomerOrderCancelled,
  notifyCustomerOrderShipped,
} from "@/lib/telegram/notifications";
import { editOrderSummary, buildSummaryFromOrderId } from "@/lib/telegram/orders-group";
import type { OrderStatus } from "@/types/database";

// Phase B: cancelOrderJobs снят (Track.global / expire-order). Phase C добавит
// cancellation для нового expire-send-by job.

const batchSchema = z.object({
  action: z.enum(["cancel", "change_status"]),
  orderIds: z.array(z.string().uuid()).min(1).max(50),
  status: z.enum(ALL_STATUSES as [string, ...string[]]).optional(),
  cancelReason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = batchSchema.parse(body);

    const supabase = createServiceClient();
    const now = new Date().toISOString();

    let successCount = 0;
    const errors: { orderId: string; error: string }[] = [];

    for (const orderId of data.orderIds) {
      try {
        const { data: order, error: orderError } = await supabase
          .from("orders")
          .select(
            "id, order_number, status, status_history, customer_id, client_price, is_paid, product_size_id, product_id, partner_id, source_partner_id, tracking_number, delivery_service"
          )
          .eq("id", orderId)
          .single();

        if (orderError || !order) {
          errors.push({ orderId, error: "Заказ не найден" });
          continue;
        }

        switch (data.action) {
          case "cancel": {
            try {
              validateTransition(order.status as OrderStatus, "cancelled" as OrderStatus);
            } catch (e) {
              errors.push({ orderId, error: (e as Error).message });
              continue;
            }

            // 1. Обновляем статус ПЕРВЫМ
            const { error: updateError } = await supabase
              .from("orders")
              .update({
                status: "cancelled",
                cancelled_at: now,
                cancel_reason: data.cancelReason || "owner_batch_cancel",
                status_history: appendStatusHistory(order.status_history, "cancelled"),
              })
              .eq("id", orderId);

            if (updateError) {
              errors.push({ orderId, error: "Ошибка обновления" });
              continue;
            }

            // 2. Side-effects: пробуждение problem-очереди.
            // current_quantity возвращает триггер update_product_quantity_on_order
            // на UPDATE OF status (миграция 20260501000020).
            try {
              if (order.product_size_id) {
                const { scheduleAutoResumeProblem } = await import("@/lib/jobs");
                scheduleAutoResumeProblem(order.product_size_id).catch((e) =>
                  console.error("[batch-cancel] scheduleAutoResumeProblem failed:", e)
                );
              }
            } catch (sideEffectError) {
              console.error(
                `[Owner batch cancel] side-effect error for ${orderId}:`,
                sideEffectError
              );
            }

            // 3. Refund на customer_balance (BUSINESS_LOGIC §9.2). Только для
            // owner-source оплаченных. Партнёрские деньги возвращает партнёр.
            // RPC идемпотентна по (order_id, reason).
            const isPartnerOrder = !!(order.partner_id || order.source_partner_id);
            if (
              order.is_paid &&
              order.customer_id &&
              (order.client_price ?? 0) > 0 &&
              !isPartnerOrder
            ) {
              const { error: creditError } = await supabase.rpc("credit_customer_for_order", {
                p_customer_id: order.customer_id,
                p_amount: order.client_price,
                p_order_id: order.id,
                p_reason: "cancelled_before_ship",
              });
              if (creditError) {
                console.error(
                  `[batch-cancel] credit_customer_for_order failed for ${orderId}:`,
                  creditError
                );
              }
            }

            // Отменить scheduled expire-send-by job (заказ больше не активный).
            try {
              const { cancelExpireSendBy } = await import("@/lib/jobs");
              cancelExpireSendBy(orderId).catch((e) =>
                console.error(`[batch-cancel] cancelExpireSendBy failed for ${orderId}:`, e)
              );
            } catch (sideEffectError) {
              console.error(
                `[batch-cancel] cancelExpireSendBy import error for ${orderId}:`,
                sideEffectError
              );
            }

            successCount++;
            break;
          }

          case "change_status": {
            if (!data.status) {
              errors.push({ orderId, error: "Статус обязателен" });
              continue;
            }

            try {
              validateTransition(order.status as OrderStatus, data.status as OrderStatus);
            } catch (e) {
              errors.push({ orderId, error: (e as Error).message });
              continue;
            }

            const updateData: Record<string, unknown> = {
              status: data.status,
              status_history: appendStatusHistory(order.status_history, data.status),
            };

            // Временные метки. Канон §4.2: sent / return_done — финальные.
            if (data.status === "cancelled") {
              updateData.cancelled_at = now;
            } else if (data.status === "sent") {
              updateData.shipped_at = now;
            } else if (data.status === "return_done") {
              updateData.return_completed_at = now;
            }

            const { error: updateError } = await supabase
              .from("orders")
              .update(updateData)
              .eq("id", orderId);

            if (updateError) {
              errors.push({ orderId, error: "Ошибка обновления" });
              continue;
            }

            successCount++;
            break;
          }
        }

        // Уведомления клиенту + карточка в группе — паритет с одиночным
        // PATCH `/api/owner/orders/[id]` (раньше batch молча менял статус:
        // клиент не получал DM, карточка в группе устаревала).
        const finalStatus = data.action === "cancel" ? "cancelled" : data.status;
        // Карточка в группе — обновить (как single-PATCH на change_status).
        buildSummaryFromOrderId(orderId)
          .then((summary) => (summary ? editOrderSummary(summary) : undefined))
          .catch((e) => console.error("[batch] editOrderSummary failed:", e));
        if (order.customer_id) {
          if (finalStatus === "cancelled") {
            notifyCustomerOrderCancelled({
              customerId: order.customer_id,
              orderId,
              orderNumber: order.order_number,
              reason: data.cancelReason ?? null,
            }).catch((e) => console.error("[batch] notifyCustomerOrderCancelled failed:", e));
          } else if (finalStatus === "sent") {
            notifyCustomerOrderShipped({
              customerId: order.customer_id,
              orderId,
              orderNumber: order.order_number,
              trackingNumber: order.tracking_number ?? null,
              deliveryService: order.delivery_service ?? null,
            }).catch((e) => console.error("[batch] notifyCustomerOrderShipped failed:", e));
          }
        }

        // Логируем
        await supabase.from("activity_log").insert({
          user_id: session.userId,
          action: `order_batch_${data.action}`,
          entity_type: "order",
          entity_id: orderId,
          details: { action: data.action, status: data.status } as Record<string, string | null>,
        });
      } catch (err) {
        console.error(`[Owner batch] Error for order ${orderId}:`, err);
        errors.push({ orderId, error: "Ошибка обработки" });
      }
    }

    return NextResponse.json({
      success: true,
      processed: successCount,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Owner batch action error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
