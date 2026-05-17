import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { validateTransition, ALL_STATUSES } from "@/lib/orders/transitions";
import { appendStatusHistory } from "@/lib/orders/status-history";
import { cancelOrderJobs } from "@/lib/jobs";
import type { OrderStatus } from "@/types/database";

const batchSchema = z.object({
  action: z.enum(["cancel", "change_status"]),
  orderIds: z.array(z.string().uuid()).min(1).max(50),
  status: z.enum(ALL_STATUSES as [string, ...string[]]).optional(),
  cancelReason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
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
            "id, order_number, status, status_history, client_id, client_price, is_paid, product_size_id, product_id"
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

            // 2. Side-effects: возврат депозита + количества
            try {
              if (order.is_paid && order.client_price > 0) {
                await supabase.rpc("increment_user_deposit", {
                  user_id: order.client_id,
                  amount: order.client_price,
                });
              }

              if (order.product_size_id) {
                await supabase.rpc("increment_product_size_quantity", {
                  size_id: order.product_size_id,
                  amount: 1,
                });
              } else if (order.product_id) {
                const { data: prod } = await supabase
                  .from("products")
                  .select("current_quantity")
                  .eq("id", order.product_id)
                  .single();
                if (prod?.current_quantity != null) {
                  await supabase
                    .from("products")
                    .update({ current_quantity: prod.current_quantity + 1 })
                    .eq("id", order.product_id);
                }
              }
            } catch (sideEffectError) {
              console.error(
                `[Owner batch cancel] side-effect error for ${orderId}:`,
                sideEffectError
              );
            }

            // 3. Отменяем запланированные jobs
            try {
              await cancelOrderJobs(orderId);
            } catch (jobError) {
              console.error(`[Owner batch cancel] Failed to cancel jobs for ${orderId}:`, jobError);
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

            // Временные метки
            if (data.status === "cancelled") {
              updateData.cancelled_at = now;
            } else if (data.status === "completed") {
              updateData.completed_at = now;
            } else if (data.status === "in_transit") {
              updateData.shipped_at = now;
            } else if (data.status === "return_completed") {
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
