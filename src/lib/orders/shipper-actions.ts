import {
  cancelOrderJobs,
  cancelMoveToTrash,
  scheduleOrderExpiration,
  scheduleDeadlineReminder,
  scheduleReturnArrived,
} from "@/lib/jobs";
import { validateTransition } from "@/lib/orders/transitions";
import { appendStatusHistory } from "@/lib/orders/status-history";
import { notifyOrderShipped, notifyOwnerOrderProblem } from "@/lib/telegram/notifications";
import type { OrderStatus } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.generated";

type Supabase = SupabaseClient<Database>;

/** Run a promise with a timeout — resolves with undefined on timeout instead of hanging */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

/** Safely cancel BullMQ jobs with a 3s timeout — never blocks the response */
function safeCancelOrderJobs(orderId: string): void {
  withTimeout(cancelOrderJobs(orderId), 3000).catch((e) =>
    console.error("[shipper-actions] cancelOrderJobs failed:", e)
  );
}

/** Fire-and-forget BullMQ call with 3s timeout */
function fireBullMQ(fn: () => Promise<unknown>, label: string): void {
  withTimeout(fn(), 3000).catch((e) => console.error(`[shipper-actions] ${label} failed:`, e));
}

/** Minimal order shape needed by action functions (from .select("*") on orders) */
export type OrderForAction = {
  id: string;
  status: string | null;
  status_history: Json | null;
  order_number: number;
  product_size_id: string | null;
  product_id: string | null;
  client_id: string;
  client_price: number;
  is_paid: boolean;
  tracking_number: string | null;
  delivery_service: string | null;
  avito_order_id: string | null;
  shipped_at: string | null;
  delivery_deadline: string;
  barcode_printed: boolean;
  linked_return_order_id: string | null;
  problem_type: string | null;
  system_comment: string | null;
  expected_return_date: string | null;
};

export type ActionResult = { success: true } | { success: false; error: string };

// ─── Helpers ───────────────────────────────────────────────────

function tryValidateTransition(current: string | null, target: OrderStatus): string | null {
  try {
    validateTransition(current as OrderStatus, target);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Adjust actual_quantity (shipper's physical count). Only acts when actual_quantity IS NOT NULL. */
async function adjustActualStock(
  supabase: Supabase,
  order: OrderForAction,
  delta: number
): Promise<void> {
  if (order.product_size_id) {
    await supabase.rpc("adjust_actual_quantity", {
      target_size_id: order.product_size_id,
      delta,
    });
  } else if (order.product_id) {
    await supabase.rpc("adjust_product_actual_quantity", {
      target_product_id: order.product_id,
      delta,
    });
  }
}

async function restoreStock(supabase: Supabase, order: OrderForAction): Promise<void> {
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

  // Also restore actual_quantity (shipper's physical count)
  await adjustActualStock(supabase, order, 1);
}

// ─── Actions ───────────────────────────────────────────────────

/** print_barcode: → collecting */
export async function executePrintBarcode(
  supabase: Supabase,
  order: OrderForAction
): Promise<ActionResult> {
  if (!order.status || !["awaiting_shipment", "collecting"].includes(order.status)) {
    return { success: false, error: "Нельзя печатать стикер для этого статуса" };
  }

  const printHistory =
    order.status !== "collecting"
      ? appendStatusHistory(order.status_history, "collecting")
      : order.status_history;

  const { error } = await supabase
    .from("orders")
    .update({
      status: "collecting",
      barcode_printed: true,
      barcode_printed_at: new Date().toISOString(),
      status_history: printHistory,
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** mark_problem: → problem */
export async function executeMarkProblem(
  supabase: Supabase,
  order: OrderForAction,
  options: { problemType?: "out_of_stock" | "bad_barcode" }
): Promise<ActionResult> {
  if (!order.status || !["awaiting_shipment", "collecting"].includes(order.status)) {
    return { success: false, error: "Нельзя пометить проблему для этого статуса" };
  }

  const validationError = tryValidateTransition(order.status, "problem");
  if (validationError) return { success: false, error: validationError };

  const { problemType } = options;

  const updateFields: Record<string, unknown> = {
    status: "problem",
    problem_type: problemType || null,
    status_history: appendStatusHistory(order.status_history, "problem"),
  };

  if (problemType === "out_of_stock") {
    let linkedReturnId: string | null = null;
    let systemComment = "Нет в наличии";

    if (order.product_size_id) {
      const { data: candidateReturns } = await supabase
        .from("orders")
        .select("id, order_number, status, expected_return_date")
        .eq("product_size_id", order.product_size_id)
        .in("status", ["return_in_transit", "return_arrived"])
        .order("expected_return_date", { ascending: true });

      if (candidateReturns && candidateReturns.length > 0) {
        const returnIds = candidateReturns.map((r) => r.id);
        const { data: alreadyLinked } = await supabase
          .from("orders")
          .select("linked_return_order_id")
          .in("linked_return_order_id", returnIds)
          .eq("status", "problem")
          .eq("problem_type", "out_of_stock");

        const linkedIds = new Set((alreadyLinked || []).map((o) => o.linked_return_order_id));

        const availableReturn = candidateReturns.find((r) => !linkedIds.has(r.id));

        if (availableReturn) {
          linkedReturnId = availableReturn.id;
          const returnDate = availableReturn.expected_return_date
            ? new Date(availableReturn.expected_return_date).toLocaleDateString("ru-RU")
            : "неизвестно";
          systemComment = `Для отправки заберите возврат заказа #${availableReturn.order_number} (прибытие: ${returnDate})`;
        }
      }
    }

    updateFields.linked_return_order_id = linkedReturnId;
    updateFields.system_comment = systemComment;
  } else if (problemType === "bad_barcode") {
    updateFields.system_comment = "Штрихкод не работает";
  }

  const { error } = await supabase.from("orders").update(updateFields).eq("id", order.id);
  if (error) return { success: false, error: error.message };

  try {
    await notifyOwnerOrderProblem({
      orderNumber: order.order_number,
      problemType: problemType || "unknown",
    });
  } catch (notifyError) {
    console.error("[shipper-actions] Failed to notify owner about problem:", notifyError);
  }

  return { success: true };
}

/** ship: → in_transit */
export async function executeShip(
  supabase: Supabase,
  order: OrderForAction,
  options: { shipperId: string; pickupPointId?: string; skipStats?: boolean }
): Promise<ActionResult> {
  if (!order.status || !["awaiting_shipment", "collecting"].includes(order.status)) {
    return { success: false, error: "Нельзя отправить заказ с этим статусом" };
  }

  const validationError = tryValidateTransition(order.status, "in_transit");
  if (validationError) return { success: false, error: validationError };

  const updateData: Record<string, unknown> = {
    status: "in_transit",
    shipped_at: new Date().toISOString(),
    shipped_by: options.shipperId,
    status_history: appendStatusHistory(order.status_history, "in_transit"),
  };

  if (options.pickupPointId) {
    updateData.pickup_point_id = options.pickupPointId;
  }

  const { error } = await supabase.from("orders").update(updateData).eq("id", order.id);
  if (error) return { success: false, error: error.message };

  // Decrement actual_quantity (shipper's physical count)
  await adjustActualStock(supabase, order, -1);

  // Cancel scheduled jobs (non-blocking with timeout)
  safeCancelOrderJobs(order.id);

  // Stats (skipped in batch — aggregated separately)
  if (!options.skipStats) {
    const today = new Date().toISOString().split("T")[0];
    await supabase.rpc("increment_shipper_stat", {
      p_shipper_id: options.shipperId,
      p_date: today,
      p_field: "orders_shipped",
      p_delta: 1,
    });
  }

  // Notify client (fire-and-forget — don't block response)
  notifyOrderShipped({
    userId: order.client_id,
    orderNumber: order.order_number,
    trackingNumber: order.tracking_number || "",
    deliveryService: order.delivery_service || "",
  }).catch((e) => console.error("[shipper-actions] notify client failed:", e));

  // Avito reverse sync (fire-and-forget)
  if (order.avito_order_id && order.tracking_number) {
    (async () => {
      try {
        const { createAvitoClientForUser } = await import("@/lib/avito");
        const { data: ownerUser } = await supabase
          .from("users")
          .select("id")
          .eq("role", "owner")
          .not("avito_client_id", "is", null)
          .limit(1)
          .single();

        if (ownerUser) {
          const avitoClient = await createAvitoClientForUser(ownerUser.id);
          if (avitoClient) {
            const avitoOrderId = parseInt(order.avito_order_id!, 10);
            await avitoClient.sendOrderTracking(avitoOrderId, order.tracking_number!);
            await avitoClient.updateOrderStatus(avitoOrderId, "sent");
            console.log(
              `[shipper-actions] Synced tracking to Avito for order ${order.avito_order_id}`
            );
          }
        }
      } catch (avitoErr) {
        console.error("[shipper-actions] Avito reverse sync failed:", avitoErr);
      }
    })();
  }

  return { success: true };
}

/** complete_return: return_arrived → return_completed */
export async function executeCompleteReturn(
  supabase: Supabase,
  order: OrderForAction,
  options: { shipperId: string; skipStats?: boolean }
): Promise<ActionResult> {
  if (order.status !== "return_arrived") {
    return { success: false, error: "Возврат ещё не прибыл" };
  }

  const validationError = tryValidateTransition(order.status, "return_completed");
  if (validationError) return { success: false, error: validationError };

  // 1. Update status first
  const { error } = await supabase
    .from("orders")
    .update({
      status: "return_completed",
      return_completed_at: new Date().toISOString(),
      return_completed_by: options.shipperId,
      status_history: appendStatusHistory(order.status_history, "return_completed"),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // 2. Side-effects: stock + deposit
  try {
    await restoreStock(supabase, order);

    if (order.client_price > 0) {
      await supabase.rpc("increment_user_deposit", {
        user_id: order.client_id,
        amount: order.client_price,
      });
    }
  } catch (sideEffectError) {
    console.error("[shipper-actions] complete_return side-effect error:", sideEffectError);
  }

  // Cancel move-to-trash timer (non-blocking)
  fireBullMQ(() => cancelMoveToTrash(order.id), "cancelMoveToTrash");

  // Stats (skipped in batch — aggregated separately)
  if (!options.skipStats) {
    const today = new Date().toISOString().split("T")[0];
    await supabase.rpc("increment_shipper_stat", {
      p_shipper_id: options.shipperId,
      p_date: today,
      p_field: "returns_collected",
      p_delta: 1,
    });
  }

  // Auto-restore linked problem orders
  const { data: linkedOrders } = await supabase
    .from("orders")
    .select(
      "id, order_number, delivery_deadline, client_id, client_price, is_paid, product_size_id"
    )
    .eq("linked_return_order_id", order.id)
    .eq("status", "problem")
    .eq("problem_type", "out_of_stock");

  if (linkedOrders && linkedOrders.length > 0) {
    const now = new Date().toISOString();

    for (const lo of linkedOrders) {
      const deadline = new Date(lo.delivery_deadline);
      const deadlineEnd = new Date(deadline);
      deadlineEnd.setHours(23, 59, 59, 999);

      if (deadlineEnd.getTime() < Date.now()) {
        // Deadline passed — cancel linked order
        await supabase
          .from("orders")
          .update({
            status: "cancelled",
            cancelled_at: now,
            cancel_reason: "auto_expired",
            problem_type: null,
            linked_return_order_id: null,
          })
          .eq("id", lo.id);

        if (lo.is_paid && lo.client_price > 0) {
          await supabase.rpc("increment_user_deposit", {
            user_id: lo.client_id,
            amount: lo.client_price,
          });
        }

        if (lo.product_size_id) {
          await supabase.rpc("increment_product_size_quantity", {
            size_id: lo.product_size_id,
            amount: 1,
          });
        }

        console.log(`[shipper-actions] Linked order ${lo.id} auto-cancelled (deadline passed)`);
        continue;
      }

      // Deadline still valid — restore order
      await supabase
        .from("orders")
        .update({
          status: "awaiting_shipment",
          problem_type: null,
          linked_return_order_id: null,
          system_comment: `Товар снова в наличии (из возврата #${order.order_number})`,
          barcode_printed: false,
        })
        .eq("id", lo.id);

      fireBullMQ(() => scheduleOrderExpiration(lo.id, deadline), "scheduleOrderExpiration");
      fireBullMQ(() => scheduleDeadlineReminder(lo.id, deadline), "scheduleDeadlineReminder");

      console.log(`[shipper-actions] Linked order ${lo.id} restored to awaiting_shipment`);
    }
  }

  return { success: true };
}

/** dispute_return: return_arrived → return_completed (no deposit refund) */
export async function executeDisputeReturn(
  supabase: Supabase,
  order: OrderForAction,
  options: {
    shipperId: string;
    disputePhotos: string[];
    disputeReason?: string;
    skipStats?: boolean;
  }
): Promise<ActionResult> {
  if (order.status !== "return_arrived") {
    return { success: false, error: "Возврат ещё не прибыл" };
  }

  if (!options.disputePhotos || options.disputePhotos.length === 0) {
    return { success: false, error: "Прикрепите хотя бы одну фотографию" };
  }

  const validationError = tryValidateTransition(order.status, "return_completed");
  if (validationError) return { success: false, error: validationError };

  const reasonText = options.disputeReason || "Качество товара не соответствует отправленному";

  // 1. Update status
  const { error } = await supabase
    .from("orders")
    .update({
      status: "return_completed",
      return_completed_at: new Date().toISOString(),
      return_completed_by: options.shipperId,
      system_comment: `quality_dispute: ${reasonText}`,
      status_history: appendStatusHistory(order.status_history, "return_completed"),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // 2. Restore stock (item physically received)
  try {
    await restoreStock(supabase, order);
  } catch (sideEffectError) {
    console.error("[shipper-actions] dispute_return quantity restore error:", sideEffectError);
  }

  // NO deposit refund — quality dispute

  // Cancel move-to-trash timer (non-blocking)
  fireBullMQ(() => cancelMoveToTrash(order.id), "cancelMoveToTrash");

  // Notify client
  await supabase.from("notifications").insert({
    user_id: order.client_id,
    type: "quality_dispute",
    title: "Проблема с качеством возврата",
    message: [
      `Заказ #${order.order_number} — при приёмке возврата обнаружено несоответствие качества товара.`,
      ``,
      `Причина: ${reasonText}`,
      ``,
      `К сожалению, мы не можем вернуть депозит за этот заказ, так как товар вернулся в состоянии, отличном от отправленного. Фотографии товара прикреплены к этому уведомлению.`,
      ``,
      `Что делать:`,
      `1. Откройте поддержку на Avito по этому заказу`,
      `2. Опишите проблему и приложите фотографии`,
      `3. Avito рассмотрит спор и вернёт вам деньги за повреждённый/несоответствующий товар`,
      ``,
      `Если у вас есть вопросы — напишите в поддержку.`,
    ].join("\n"),
    data: {
      order_id: order.id,
      order_number: order.order_number,
      dispute_photos: options.disputePhotos,
      dispute_reason: reasonText,
    },
  });

  // Stats
  if (!options.skipStats) {
    const today = new Date().toISOString().split("T")[0];
    await supabase.rpc("increment_shipper_stat", {
      p_shipper_id: options.shipperId,
      p_date: today,
      p_field: "returns_collected",
      p_delta: 1,
    });
  }

  return { success: true };
}

/** start_return: not_picked_up → return_in_transit */
export async function executeStartReturn(
  supabase: Supabase,
  order: OrderForAction
): Promise<ActionResult> {
  if (order.status !== "not_picked_up") {
    return { success: false, error: "Начать возврат можно только для заказа «Не забрали»" };
  }

  const validationError = tryValidateTransition(order.status, "return_in_transit");
  if (validationError) return { success: false, error: validationError };

  const expectedReturn = new Date();
  expectedReturn.setDate(expectedReturn.getDate() + 14);

  const { error } = await supabase
    .from("orders")
    .update({
      status: "return_in_transit",
      status_history: appendStatusHistory(order.status_history, "return_in_transit"),
      expected_return_date: expectedReturn.toISOString(),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  fireBullMQ(() => scheduleReturnArrived(order.id, expectedReturn), "scheduleReturnArrived");

  return { success: true };
}

/** mark_return_arrived: return_in_transit → return_arrived (manual) */
export async function executeMarkReturnArrived(
  supabase: Supabase,
  order: OrderForAction
): Promise<ActionResult> {
  if (order.status !== "return_in_transit") {
    return { success: false, error: "Отметить прибытие можно только для возврата в пути" };
  }

  const validationError = tryValidateTransition(order.status, "return_arrived");
  if (validationError) return { success: false, error: validationError };

  const { error } = await supabase
    .from("orders")
    .update({
      status: "return_arrived",
      status_history: appendStatusHistory(order.status_history, "return_arrived"),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // Cancel the scheduled auto-transition job
  safeCancelOrderJobs(order.id);

  return { success: true };
}

/** set_size: set size for Avito orders without size */
export async function executeSetSize(
  supabase: Supabase,
  order: OrderForAction,
  options: { size: string; productSizeId: string }
): Promise<ActionResult> {
  if (!order.status || !["awaiting_shipment", "problem"].includes(order.status)) {
    return {
      success: false,
      error:
        "Установить размер можно только для заказа в статусе «Ожидает отправки» или «Проблема»",
    };
  }

  if (!options.size || !options.productSizeId) {
    return { success: false, error: "Укажите размер и product_size_id" };
  }

  // If order already had a size — restore old size quantity
  if (order.product_size_id) {
    try {
      await supabase.rpc("increment_product_size_quantity", {
        size_id: order.product_size_id,
        amount: 1,
      });
    } catch (restoreError) {
      console.error("[shipper-actions] set_size restore old size error:", restoreError);
    }
  }

  // Update order
  const { error } = await supabase
    .from("orders")
    .update({
      size: options.size,
      product_size_id: options.productSizeId,
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // Decrement new size quantity
  try {
    const { data: sizeData } = await supabase
      .from("product_sizes")
      .select("current_quantity")
      .eq("id", options.productSizeId)
      .single();

    if (sizeData && sizeData.current_quantity > 0) {
      await supabase
        .from("product_sizes")
        .update({ current_quantity: sizeData.current_quantity - 1 })
        .eq("id", options.productSizeId);
    }
  } catch (decrementError) {
    console.error("[shipper-actions] set_size decrement error:", decrementError);
  }

  return { success: true };
}

/** cancel_order: awaiting_shipment → cancelled */
export async function executeCancelOrder(
  supabase: Supabase,
  order: OrderForAction
): Promise<ActionResult> {
  if (order.status !== "awaiting_shipment") {
    return { success: false, error: "Отменить можно только заказ в статусе «Ожидает отправки»" };
  }

  const validationError = tryValidateTransition(order.status, "cancelled");
  if (validationError) return { success: false, error: validationError };

  const { error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: "shipper_manual",
      status_history: appendStatusHistory(order.status_history, "cancelled"),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // Restore stock
  try {
    await restoreStock(supabase, order);
  } catch (sideEffectError) {
    console.error("[shipper-actions] cancel_order stock restore error:", sideEffectError);
  }

  // Cancel BullMQ jobs (non-blocking with timeout)
  safeCancelOrderJobs(order.id);

  return { success: true };
}

/** undo_print: collecting → awaiting_shipment */
export async function executeUndoPrint(
  supabase: Supabase,
  order: OrderForAction
): Promise<ActionResult> {
  if (order.status !== "collecting") {
    return {
      success: false,
      error: "Отменить печать можно только для заказа в статусе «Собирается»",
    };
  }

  const validationError = tryValidateTransition(order.status, "awaiting_shipment");
  if (validationError) return { success: false, error: validationError };

  const { error } = await supabase
    .from("orders")
    .update({
      status: "awaiting_shipment",
      barcode_printed: false,
      barcode_printed_at: null,
      status_history: appendStatusHistory(order.status_history, "awaiting_shipment"),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** undo_ship: in_transit → collecting */
export async function executeUndoShip(
  supabase: Supabase,
  order: OrderForAction,
  options: { shipperId: string; skipStats?: boolean }
): Promise<ActionResult> {
  if (order.status !== "in_transit") {
    return { success: false, error: "Отменить отправку можно только для заказа «В пути»" };
  }

  const validationError = tryValidateTransition(order.status, "collecting");
  if (validationError) return { success: false, error: validationError };

  const { error } = await supabase
    .from("orders")
    .update({
      status: "collecting",
      shipped_at: null,
      shipped_by: null,
      pickup_point_id: null,
      status_history: appendStatusHistory(order.status_history, "collecting"),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };

  // Re-schedule BullMQ jobs (non-blocking)
  const deadline = new Date(order.delivery_deadline);
  fireBullMQ(() => scheduleOrderExpiration(order.id, deadline), "scheduleOrderExpiration");
  fireBullMQ(() => scheduleDeadlineReminder(order.id, deadline), "scheduleDeadlineReminder");

  // Rollback stats for the date the order was shipped
  if (!options.skipStats) {
    const today = new Date().toISOString().split("T")[0];
    const shippedDate = order.shipped_at
      ? new Date(order.shipped_at).toISOString().split("T")[0]
      : today;

    await supabase.rpc("increment_shipper_stat", {
      p_shipper_id: options.shipperId,
      p_date: shippedDate,
      p_field: "orders_shipped",
      p_delta: -1,
    });
  }

  return { success: true };
}

/** undo_problem: problem → previous status (collecting or awaiting_shipment) */
export async function executeUndoProblem(
  supabase: Supabase,
  order: OrderForAction
): Promise<ActionResult> {
  if (order.status !== "problem") {
    return { success: false, error: "Вернуть можно только заказ в статусе «Проблема»" };
  }

  const history = (order.status_history || []) as Array<{
    status: string;
    timestamp: string;
  }>;
  const previousEntry = history.length >= 2 ? history[history.length - 2] : null;
  const targetStatus = previousEntry?.status === "collecting" ? "collecting" : "awaiting_shipment";

  const validationError = tryValidateTransition(order.status, targetStatus as OrderStatus);
  if (validationError) return { success: false, error: validationError };

  const { error } = await supabase
    .from("orders")
    .update({
      status: targetStatus,
      problem_type: null,
      linked_return_order_id: null,
      system_comment: null,
      status_history: appendStatusHistory(order.status_history, targetStatus),
    })
    .eq("id", order.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
