import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getShipperSession } from "@/lib/auth/session";
import {
  executePrintBarcode,
  executeMarkProblem,
  executeShip,
  executeCompleteReturn,
  executeDisputeReturn,
  executeStartReturn,
  executeSetSize,
  executeCancelOrder,
  executeUndoPrint,
  executeUndoShip,
  executeUndoProblem,
  type ActionResult,
  type OrderForAction,
} from "@/lib/orders/shipper-actions";

const updateSchema = z.object({
  action: z.enum([
    "print_barcode", // Напечатать стикер → collecting
    "mark_problem", // Нет в наличии → problem
    "ship", // Отправить → in_transit
    "complete_return", // Забрать возврат → return_completed
    "dispute_return", // Проблема с качеством → return_completed (без возврата депозита)
    "start_return", // Не забрали → return_in_transit
    "set_size", // Установить размер для заказа без размера (Avito)
    // Undo actions
    "cancel_order", // Отменить заказ → cancelled (+ восстановить наличие)
    "undo_print", // Отменить печать → awaiting_shipment
    "undo_ship", // Отменить отправку → collecting (+ откат stats)
    "undo_problem", // Вернуть из проблемы → awaiting_shipment
  ]),
  pickup_point_id: z.string().uuid().optional(),
  // Для mark_problem
  problem_type: z.enum(["out_of_stock", "bad_barcode"]).optional(),
  // Для dispute_return
  dispute_photos: z.array(z.string()).min(1).max(5).optional(),
  dispute_reason: z.string().max(500).optional(),
  // Для set_size
  size: z.string().min(1).max(10).optional(),
  product_size_id: z.string().uuid().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      action,
      pickup_point_id,
      problem_type,
      dispute_photos,
      dispute_reason,
      size,
      product_size_id,
    } = updateSchema.parse(body);

    const supabase = createServiceClient();

    // Получаем заказ
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*, client:users!orders_client_id_fkey(*), product_size:product_sizes(*)")
      .eq("id", id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    const orderData = order as unknown as OrderForAction;

    const actions: Record<string, () => Promise<ActionResult>> = {
      print_barcode: () => executePrintBarcode(supabase, orderData),
      mark_problem: () => executeMarkProblem(supabase, orderData, { problemType: problem_type }),
      ship: () =>
        executeShip(supabase, orderData, {
          shipperId: session.userId,
          pickupPointId: pickup_point_id,
        }),
      complete_return: () =>
        executeCompleteReturn(supabase, orderData, { shipperId: session.userId }),
      dispute_return: () =>
        executeDisputeReturn(supabase, orderData, {
          shipperId: session.userId,
          disputePhotos: dispute_photos || [],
          disputeReason: dispute_reason,
        }),
      start_return: () => executeStartReturn(supabase, orderData),
      set_size: () =>
        executeSetSize(supabase, orderData, {
          size: size || "",
          productSizeId: product_size_id || "",
        }),
      cancel_order: () => executeCancelOrder(supabase, orderData),
      undo_print: () => executeUndoPrint(supabase, orderData),
      undo_ship: () => executeUndoShip(supabase, orderData, { shipperId: session.userId }),
      undo_problem: () => executeUndoProblem(supabase, orderData),
    };

    const result = await actions[action]();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Order action error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
