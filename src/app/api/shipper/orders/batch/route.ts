import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getShipperSession } from "@/lib/auth/session";
import {
  executeStartCollecting,
  executeMarkPrinted,
  executeMarkProblem,
  executeShip,
  executeCompleteReturn,
  executeStartReturn,
  executeCancelOrder,
  executeUndoPrint,
  executeUndoShip,
  executeUndoProblem,
  executeSetSize,
  executeMarkReturnArrived,
  type ActionResult,
  type OrderForAction,
} from "@/lib/orders/shipper-actions";

const batchSchema = z.object({
  action: z.enum([
    // Phase E — 3 этапа отправщика (BUSINESS_LOGIC §4.4):
    "start_collecting",
    "mark_printed",
    "mark_sent",
    // Legacy aliases:
    "print_barcode",
    "ship",
    // Прочее:
    "mark_problem",
    "complete_return",
    "start_return",
    "mark_return_arrived",
    "cancel_order",
    "undo_print",
    "undo_ship",
    "undo_problem",
    "set_size",
  ]),
  order_ids: z.array(z.string().uuid()).min(1),
  pickup_point_id: z.string().uuid().optional(),
  problem_type: z.enum(["out_of_stock", "bad_barcode"]).optional(),
  problem_scope: z.enum(["single", "all"]).optional(),
  size: z.string().min(1).max(10).optional(),
  product_size_id: z.string().uuid().optional(),
});

/** Actions where stats are aggregated at batch level (not per-order) */
const BATCH_AGGREGATED_STATS: Record<string, string> = {
  ship: "orders_shipped",
  mark_sent: "orders_shipped",
  complete_return: "returns_collected",
};

export async function POST(request: NextRequest) {
  try {
    const session = await getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const {
      action,
      order_ids,
      pickup_point_id,
      problem_type,
      problem_scope,
      size,
      product_size_id,
    } = batchSchema.parse(body);

    const supabase = createServiceClient();

    let successCount = 0;
    const errors: { orderId: string; error: string }[] = [];

    // Ship/complete_return stats are aggregated after the loop
    const skipStats = action in BATCH_AGGREGATED_STATS;

    // Fetch all orders in one query instead of N+1.
    // customer не JOIN-им (см. shipper/orders/[id]/route.ts).
    const { data: orders, error: fetchError } = await supabase
      .from("orders")
      .select("*, product_size:product_sizes(*)")
      .in("id", order_ids);

    if (fetchError) {
      return NextResponse.json({ error: "Ошибка загрузки заказов" }, { status: 500 });
    }

    const ordersMap = new Map(orders.map((o) => [o.id, o]));

    for (const orderId of order_ids) {
      try {
        const order = ordersMap.get(orderId);
        if (!order) {
          errors.push({ orderId, error: "Заказ не найден" });
          continue;
        }

        const orderData = order as unknown as OrderForAction;

        const shipFn = () =>
          executeShip(supabase, orderData, {
            shipperId: session.userId,
            pickupPointId: pickup_point_id,
            skipStats,
          });

        const actionMap: Record<string, () => Promise<ActionResult>> = {
          // Phase E.
          start_collecting: () => executeStartCollecting(supabase, orderData, session.userId),
          mark_printed: () => executeMarkPrinted(supabase, orderData, session.userId),
          mark_sent: shipFn,
          // Legacy aliases.
          print_barcode: () => executeStartCollecting(supabase, orderData, session.userId),
          ship: shipFn,
          // Прочее.
          mark_problem: () =>
            executeMarkProblem(supabase, orderData, {
              problemType: problem_type,
              shipperId: session.userId,
              scope: problem_scope,
            }),
          complete_return: () =>
            executeCompleteReturn(supabase, orderData, {
              shipperId: session.userId,
              skipStats,
            }),
          start_return: () => executeStartReturn(supabase, orderData),
          mark_return_arrived: () => executeMarkReturnArrived(supabase, orderData),
          cancel_order: () => executeCancelOrder(supabase, orderData),
          undo_print: () => executeUndoPrint(supabase, orderData),
          undo_ship: () =>
            executeUndoShip(supabase, orderData, {
              shipperId: session.userId,
            }),
          undo_problem: () => executeUndoProblem(supabase, orderData),
          set_size: () =>
            executeSetSize(supabase, orderData, {
              size: size || "",
              productSizeId: product_size_id || "",
            }),
        };

        const result = await actionMap[action]();

        if (result.success) {
          successCount++;
        } else {
          errors.push({ orderId, error: result.error });
        }
      } catch (err) {
        console.error(`Batch action error for order ${orderId}:`, err);
        errors.push({ orderId, error: "Ошибка обработки" });
      }
    }

    // Aggregated stats for ship/complete_return
    if (successCount > 0 && action in BATCH_AGGREGATED_STATS) {
      const today = new Date().toISOString().split("T")[0];
      await supabase.rpc("increment_shipper_stat", {
        p_shipper_id: session.userId,
        p_date: today,
        p_field: BATCH_AGGREGATED_STATS[action],
        p_delta: successCount,
      });
    }

    return NextResponse.json({
      success: true,
      processed: successCount,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Batch action error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
