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
    // Действия отправщика (BUSINESS_LOGIC §4.4):
    "start_collecting", // Беру в работу: paid → collecting
    "mark_printed", // Отметить печать стикера (collecting, флаг barcode_printed)
    "mark_sent", // Сдал в ПВЗ: collecting → sent
    // Legacy aliases (старый UI ещё использует):
    "print_barcode", // alias → start_collecting
    "ship", // alias → mark_sent
    // Прочие действия:
    "mark_problem", // Нет в наличии → problem
    "complete_return", // Забрать возврат → return_done
    "dispute_return", // Плохое качество → return_done (БЕЗ возврата денег)
    "start_return", // Не забрали → return_in_transit
    "set_size", // Установить размер для заказа без размера (Avito)
    "cancel_order", // Отменить заказ → cancelled
    "undo_print", // Отменить взятие в работу → paid
    "undo_ship", // Отменить отправку → collecting
    "undo_problem", // Вернуть из проблемы → paid
  ]),
  pickup_point_id: z.string().uuid().optional(),
  // Для mark_problem
  problem_type: z.enum(["out_of_stock", "bad_barcode"]).optional(),
  // Для mark_problem с problem_type=out_of_stock — каскадить ли на остальные active
  // заказы того же размера. По умолчанию "single" (только этот). Канон §11.2.
  problem_scope: z.enum(["single", "all"]).optional(),
  // Для dispute_return — ≥3 фото и описание обязательны (BUSINESS_LOGIC §6.4 расширение).
  dispute_photos: z.array(z.string()).min(3).max(5).optional(),
  dispute_reason: z.string().min(5).max(500).optional(),
  // Для set_size
  size: z.string().min(1).max(10).optional(),
  product_size_id: z.string().uuid().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      action,
      pickup_point_id,
      problem_type,
      problem_scope,
      dispute_photos,
      dispute_reason,
      size,
      product_size_id,
    } = updateSchema.parse(body);

    const supabase = createServiceClient();

    // Получаем заказ (customer не JOIN-им — shipper не имеет доступа к customers
    // через RLS; имя клиента — в customer_name_snapshot/customer_tg_username_snapshot).
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*, product_size:product_sizes(*)")
      .eq("id", id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    const orderData = order as unknown as OrderForAction;

    const shipForCurrentStatus = () =>
      executeShip(supabase, orderData, {
        shipperId: session.userId,
        pickupPointId: pickup_point_id,
      });

    const actions: Record<string, () => Promise<ActionResult>> = {
      // Phase E — 3 этапа.
      start_collecting: () => executeStartCollecting(supabase, orderData, session.userId),
      mark_printed: () => executeMarkPrinted(supabase, orderData, session.userId),
      mark_sent: shipForCurrentStatus,
      // Legacy aliases.
      print_barcode: () => executeStartCollecting(supabase, orderData, session.userId),
      ship: shipForCurrentStatus,
      // Прочее.
      mark_problem: () =>
        executeMarkProblem(supabase, orderData, {
          problemType: problem_type,
          shipperId: session.userId,
          scope: problem_scope,
        }),
      complete_return: () =>
        executeCompleteReturn(supabase, orderData, { shipperId: session.userId }),
      dispute_return: () => {
        if (!dispute_photos || dispute_photos.length < 3) {
          return Promise.resolve({
            success: false as const,
            error: "Нужно минимум 3 фото",
          });
        }
        if (!dispute_reason || dispute_reason.trim().length < 5) {
          return Promise.resolve({
            success: false as const,
            error: "Опишите проблему (минимум 5 символов)",
          });
        }
        return executeDisputeReturn(supabase, orderData, {
          shipperId: session.userId,
          disputePhotos: dispute_photos,
          disputeReason: dispute_reason,
        });
      },
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
