import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getShipperSession } from "@/lib/auth/session";
import {
  executePrintBarcode,
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
    "print_barcode",
    "mark_problem",
    "ship",
    "complete_return",
    "start_return",
    "mark_return_arrived",
    // Undo actions
    "cancel_order",
    "undo_print",
    "undo_ship",
    "undo_problem",
    "set_size",
  ]),
  order_ids: z.array(z.string().uuid()).min(1),
  pickup_point_id: z.string().uuid().optional(),
  problem_type: z.enum(["out_of_stock", "bad_barcode"]).optional(),
  size: z.string().min(1).max(10).optional(),
  product_size_id: z.string().uuid().optional(),
});

/** Actions where stats are aggregated at batch level (not per-order) */
const BATCH_AGGREGATED_STATS: Record<string, string> = {
  ship: "orders_shipped",
  complete_return: "returns_collected",
};

export async function POST(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const { action, order_ids, pickup_point_id, problem_type, size, product_size_id } =
      batchSchema.parse(body);

    const supabase = createServiceClient();

    let successCount = 0;
    const errors: { orderId: string; error: string }[] = [];

    // Ship/complete_return stats are aggregated after the loop
    const skipStats = action in BATCH_AGGREGATED_STATS;

    // Fetch all orders in one query instead of N+1
    const { data: orders, error: fetchError } = await supabase
      .from("orders")
      .select("*, client:users!orders_client_id_fkey(*), product_size:product_sizes(*)")
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

        const actionMap: Record<string, () => Promise<ActionResult>> = {
          print_barcode: () => executePrintBarcode(supabase, orderData),
          mark_problem: () =>
            executeMarkProblem(supabase, orderData, { problemType: problem_type }),
          ship: () =>
            executeShip(supabase, orderData, {
              shipperId: session.userId,
              pickupPointId: pickup_point_id,
              skipStats,
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
