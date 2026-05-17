import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import {
  cancelOrderJobs,
  scheduleOrderExpiration,
  scheduleDeadlineReminder,
  scheduleReturnArrived,
  scheduleMoveToTrash,
  cancelMoveToTrash,
  cancelDisposeTrash,
} from "@/lib/jobs";
import { processReferralBonus } from "@/lib/orders";
import { isTrackableService } from "@/lib/delivery/types";
import { getSession } from "@/lib/auth/session";
import { validateTransition } from "@/lib/orders/transitions";
import { appendStatusHistory } from "@/lib/orders/status-history";
import type { OrderStatus } from "@/types/database";

// Схема обновления заказа
const updateOrderSchema = z.object({
  // Изменение размера (только awaiting_shipment)
  productSizeId: z.string().uuid().optional(),
  size: z.string().optional(),
  // Изменение штрихкода (awaiting_shipment, collecting)
  barcodeImageUrl: z.string().url().optional(),
  // Изменение трек-номера (awaiting_shipment, collecting)
  trackingNumber: z.string().min(1).optional(),
  // Изменение дедлайна (awaiting_shipment, collecting, +5 дней макс)
  deliveryDeadline: z.string().datetime().optional(),
  // Изменение цены продажи (любой статус до completed)
  salePrice: z.number().positive().optional(),
  // Отмена заказа
  cancel: z.boolean().optional(),
  cancelReason: z.string().max(500).optional(),
  // Завершение заказа (in_transit → completed)
  complete: z.boolean().optional(),
  // Возврат (только ручные заказы: Avito, Yandex)
  initiateReturn: z.boolean().optional(),
  returnBarcodeImageUrl: z.string().url().optional(),
  returnTrackingNumber: z.string().max(100).optional(),
  expectedReturnDate: z.string().datetime().optional(),
  // Код возврата (return_in_transit, return_arrived)
  returnCode: z.string().max(50).optional(),
  // Продление срока забора возврата (только ручные, return_arrived)
  returnDeadline: z.string().datetime().optional(),
  // Восстановление из утиля (trash → return_in_transit)
  restoreFromTrash: z.boolean().optional(),
});

// GET /api/orders/[id] — детали заказа
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: order, error } = await supabase
      .from("orders")
      .select(
        `
        *,
        product:products(
          id, name, brand, category, description,
          photo_urls, drop_price, recommended_price, measurements
        ),
        product_size:product_sizes(id, size, current_quantity)
      `
      )
      .eq("id", params.id)
      .eq("client_id", session.userId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    // Добавляем информацию о доступных действиях
    const allowedActions = getOrderAllowedActions(
      order.status || "",
      order.delivery_service || "",
      order.problem_type
    );

    return NextResponse.json({
      order,
      allowedActions,
    });
  } catch (error) {
    console.error("Order detail API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// PATCH /api/orders/[id] — обновление заказа
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const result = updateOrderSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Неверные данные", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Получаем текущий заказ
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", params.id)
      .eq("client_id", session.userId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    const status = order.status || "";
    const deliveryService = order.delivery_service || "";
    const allowedActions = getOrderAllowedActions(status, deliveryService, order.problem_type);
    const updateData: Record<string, unknown> = {};

    // Отмена заказа
    if (result.data.cancel) {
      if (!allowedActions.canCancel) {
        return NextResponse.json(
          { error: "Отмена недоступна для данного статуса" },
          { status: 400 }
        );
      }

      // Валидируем переход (problem→cancelled для bad_barcode, awaiting_shipment→cancelled)
      const cancelFrom = status as OrderStatus;
      validateTransition(cancelFrom, "cancelled");

      const newHistory = appendStatusHistory(order.status_history, "cancelled");

      // 1. Обновляем статус ПЕРВЫМ — это главное действие
      const { data: cancelledOrder, error: cancelError } = await supabase
        .from("orders")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancel_reason: result.data.cancelReason || "Отменён клиентом",
          status_history: newHistory,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.id)
        .select("*")
        .single();

      if (cancelError) {
        console.error("Cancel order error:", cancelError);
        return NextResponse.json({ error: "Ошибка отмены заказа" }, { status: 500 });
      }

      // 2. Side-effects: количество и депозит (после успешной смены статуса)
      try {
        if (order.product_size_id) {
          await supabase.rpc("increment_product_size_quantity", {
            size_id: order.product_size_id,
            amount: 1,
          });
        } else if (order.product_id) {
          // Товар без размеров — инкремент current_quantity на продукте
          await supabase
            .from("products")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", order.product_id)
            .select("current_quantity")
            .single()
            .then(async ({ data: prod }) => {
              if (prod?.current_quantity != null) {
                await supabase
                  .from("products")
                  .update({ current_quantity: prod.current_quantity + 1 })
                  .eq("id", order.product_id!);
              }
            });
        }

        if (order.client_price > 0) {
          await supabase.rpc("increment_user_deposit", {
            user_id: session.userId,
            amount: order.client_price,
          });
        }
      } catch (sideEffectError) {
        // Статус уже обновлён — логируем ошибку для ручного исправления
        console.error(
          "[Orders API] Cancel side-effect error (order already cancelled):",
          sideEffectError
        );
      }

      // 3. Отменяем запланированные job'ы
      try {
        await cancelOrderJobs(params.id);
      } catch (jobError) {
        console.error("[Orders API] Failed to cancel jobs:", jobError);
      }

      // Activity log
      await supabase.from("activity_log").insert({
        user_id: session.userId,
        action: "order_updated",
        entity_type: "order",
        entity_id: params.id,
        details: { status: "cancelled", cancel_reason: result.data.cancelReason },
      });

      return NextResponse.json({ success: true, order: cancelledOrder });
    }

    // Изменение размера
    if (result.data.productSizeId && result.data.size) {
      if (!allowedActions.canChangeSize) {
        return NextResponse.json(
          { error: "Изменение размера недоступно для данного статуса" },
          { status: 400 }
        );
      }

      if (!order.product_id) {
        return NextResponse.json({ error: "Товар не найден" }, { status: 400 });
      }

      // Проверяем наличие нового размера
      const { data: newSize, error: newSizeError } = await supabase
        .from("product_sizes")
        .select("*")
        .eq("id", result.data.productSizeId)
        .eq("product_id", order.product_id)
        .single();

      if (newSizeError || !newSize) {
        return NextResponse.json({ error: "Размер не найден" }, { status: 404 });
      }

      const available = newSize.current_quantity - (newSize.reserved_quantity || 0);
      if (available <= 0) {
        return NextResponse.json({ error: "Размер недоступен" }, { status: 400 });
      }

      // Возвращаем старый размер (атомарно)
      if (order.product_size_id) {
        await supabase.rpc("increment_product_size_quantity", {
          size_id: order.product_size_id,
          amount: 1,
        });
      }

      // Забираем новый размер (атомарно)
      await supabase.rpc("increment_product_size_quantity", {
        size_id: result.data.productSizeId,
        amount: -1,
      });

      updateData.product_size_id = result.data.productSizeId;
      updateData.size = result.data.size;
    }

    // Изменение штрихкода
    if (result.data.barcodeImageUrl) {
      if (!allowedActions.canChangeBarcode) {
        return NextResponse.json(
          { error: "Изменение штрихкода недоступно для данного статуса" },
          { status: 400 }
        );
      }
      updateData.barcode_image_url = result.data.barcodeImageUrl;

      // Если это исправление bad_barcode — восстанавливаем заказ
      if (status === "problem" && order.problem_type === "bad_barcode") {
        validateTransition(status as OrderStatus, "awaiting_shipment");
        updateData.status = "awaiting_shipment";
        updateData.problem_type = null;
        updateData.barcode_printed = false;
        updateData.status_history = appendStatusHistory(order.status_history, "awaiting_shipment");
      }
    }

    // Изменение трек-номера
    if (result.data.trackingNumber) {
      if (!allowedActions.canChangeBarcode) {
        return NextResponse.json(
          { error: "Изменение трек-номера недоступно для данного статуса" },
          { status: 400 }
        );
      }
      updateData.tracking_number = result.data.trackingNumber;

      // Если это исправление bad_barcode — восстанавливаем заказ
      if (status === "problem" && order.problem_type === "bad_barcode") {
        validateTransition(status as OrderStatus, "awaiting_shipment");
        updateData.status = "awaiting_shipment";
        updateData.problem_type = null;
        updateData.barcode_printed = false;
        updateData.barcode_image_url = null;
        updateData.status_history = appendStatusHistory(order.status_history, "awaiting_shipment");
      }
    }

    // Изменение дедлайна
    if (result.data.deliveryDeadline) {
      if (!allowedActions.canChangeDeadline) {
        return NextResponse.json(
          { error: "Изменение дедлайна недоступно для данного статуса" },
          { status: 400 }
        );
      }

      // Проверяем что продление не более +5 дней
      const currentDeadline = new Date(order.delivery_deadline);
      const newDeadline = new Date(result.data.deliveryDeadline);
      const maxDeadline = new Date(currentDeadline);
      maxDeadline.setDate(maxDeadline.getDate() + 5);

      if (newDeadline > maxDeadline) {
        return NextResponse.json({ error: "Можно продлить максимум на 5 дней" }, { status: 400 });
      }

      updateData.delivery_deadline = result.data.deliveryDeadline;

      // Перепланируем job'ы с новым дедлайном
      try {
        await cancelOrderJobs(params.id);
        await scheduleOrderExpiration(params.id, newDeadline);
        await scheduleDeadlineReminder(params.id, newDeadline);
      } catch (jobError) {
        console.error("[Orders API] Failed to reschedule jobs:", jobError);
      }
    }

    // Изменение цены продажи
    if (result.data.salePrice !== undefined) {
      if (!allowedActions.canChangeSalePrice) {
        return NextResponse.json(
          { error: "Изменение цены продажи недоступно для данного статуса" },
          { status: 400 }
        );
      }
      updateData.sale_price = result.data.salePrice;
      updateData.client_profit = result.data.salePrice - order.client_price;
    }

    // Завершение заказа
    if (result.data.complete) {
      if (!allowedActions.canComplete) {
        return NextResponse.json(
          { error: "Завершение недоступно для данного статуса" },
          { status: 400 }
        );
      }
      validateTransition(status as OrderStatus, "completed");
      updateData.status = "completed";
      updateData.completed_at = new Date().toISOString();
      updateData.status_history = appendStatusHistory(order.status_history, "completed");
    }

    // Инициация возврата
    if (result.data.initiateReturn) {
      if (!allowedActions.canInitiateReturn) {
        return NextResponse.json(
          { error: "Возврат недоступен для данного статуса" },
          { status: 400 }
        );
      }

      // Обязательна дата прибытия
      if (!result.data.expectedReturnDate) {
        return NextResponse.json(
          { error: "Укажите ожидаемую дату прибытия возврата" },
          { status: 400 }
        );
      }

      // Возврат со статуса completed: обязателен новый трек-номер (это новый заказ в системе Avito)
      if (status === "completed" && !result.data.returnTrackingNumber) {
        return NextResponse.json(
          { error: "Укажите трек-номер нового отправления возврата" },
          { status: 400 }
        );
      }

      validateTransition(status as OrderStatus, "return_in_transit");
      updateData.status = "return_in_transit";
      updateData.expected_return_date = result.data.expectedReturnDate;
      updateData.status_history = appendStatusHistory(order.status_history, "return_in_transit");

      if (result.data.returnBarcodeImageUrl) {
        updateData.return_barcode_image_url = result.data.returnBarcodeImageUrl;
      }

      // Трек-номер возврата (обязателен для completed, опционален для in_transit)
      if (result.data.returnTrackingNumber) {
        updateData.return_tracking_number = result.data.returnTrackingNumber;
        updateData.tracking_number = result.data.returnTrackingNumber;
      }
    }

    // Продление срока забора возврата (только ручные, return_arrived)
    if (result.data.returnDeadline) {
      if (!allowedActions.canExtendReturnDeadline) {
        return NextResponse.json({ error: "Продление срока забора недоступно" }, { status: 400 });
      }

      const newDeadline = new Date(result.data.returnDeadline);
      updateData.trash_deadline = newDeadline.toISOString();

      // Перезапускаем таймер утиля
      try {
        await cancelMoveToTrash(params.id);
        const daysUntilTrash = Math.max(
          1,
          Math.ceil((newDeadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        );
        await scheduleMoveToTrash(params.id, daysUntilTrash);
      } catch (jobError) {
        console.error("[Orders API] Failed to reschedule trash timer:", jobError);
      }
    }

    // Код возврата
    if (result.data.returnCode) {
      if (!allowedActions.canSetReturnCode) {
        return NextResponse.json(
          { error: "Код возврата недоступен для данного статуса" },
          { status: 400 }
        );
      }
      updateData.return_code = result.data.returnCode;
      updateData.return_code_updated_at = new Date().toISOString();
    }

    // Восстановление из утиля (клиент договорился с Avito о возврате на ПВЗ)
    if (result.data.restoreFromTrash) {
      if (!allowedActions.canRestoreFromTrash) {
        return NextResponse.json(
          { error: "Восстановление недоступно для данного статуса" },
          { status: 400 }
        );
      }

      if (!result.data.expectedReturnDate) {
        return NextResponse.json(
          { error: "Укажите ожидаемую дату прибытия на ПВЗ" },
          { status: 400 }
        );
      }

      validateTransition(status as OrderStatus, "return_in_transit");
      updateData.status = "return_in_transit";
      updateData.expected_return_date = result.data.expectedReturnDate;
      updateData.return_code = null;
      updateData.trash_at = null;
      updateData.status_history = appendStatusHistory(order.status_history, "return_in_transit");

      if (result.data.returnTrackingNumber) {
        updateData.return_tracking_number = result.data.returnTrackingNumber;
        updateData.tracking_number = result.data.returnTrackingNumber;
      }

      // Отменяем таймер disposed
      try {
        await cancelDisposeTrash(params.id);
      } catch (jobError) {
        console.error("[Orders API] Failed to cancel dispose job:", jobError);
      }

      // Планируем новый return_arrived
      try {
        await scheduleReturnArrived(params.id, new Date(result.data.expectedReturnDate));
      } catch (jobError) {
        console.error("[Orders API] Failed to schedule return-arrived:", jobError);
      }
    }

    // Если нет изменений
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
    }

    updateData.updated_at = new Date().toISOString();

    // Обновляем заказ
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", params.id)
      .select("*")
      .single();

    if (updateError) {
      console.error("Update order error:", updateError);
      return NextResponse.json({ error: "Ошибка обновления заказа" }, { status: 500 });
    }

    // Реферальные бонусы при завершении заказа
    if (result.data.complete) {
      processReferralBonus(supabase, order.client_id, order.client_price).catch((err) => {
        console.error("[Orders API] Referral bonus error:", err);
      });
    }

    // Планируем переход в return_arrived при создании возврата
    if (result.data.initiateReturn && result.data.expectedReturnDate) {
      try {
        await scheduleReturnArrived(params.id, new Date(result.data.expectedReturnDate));
      } catch (jobError) {
        console.error("[Orders API] Failed to schedule return-arrived:", jobError);
      }
    }

    // Логируем действие
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "order_updated",
      entity_type: "order",
      entity_id: params.id,
      details: JSON.parse(JSON.stringify(updateData)),
    });

    return NextResponse.json({
      success: true,
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Update order API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// Определяет доступные действия для статуса заказа
function getOrderAllowedActions(
  status: string,
  deliveryService: string,
  problemType?: string | null
) {
  const autoTracked = isTrackableService(deliveryService);
  const isBadBarcode = status === "problem" && problemType === "bad_barcode";

  return {
    // Общее
    isAutoTracked: autoTracked,
    canCancel: status === "awaiting_shipment" || isBadBarcode,
    canChangeSize: status === "awaiting_shipment",
    canChangeBarcode: ["awaiting_shipment", "collecting"].includes(status) || isBadBarcode,
    canChangeDeadline: ["awaiting_shipment", "collecting"].includes(status),
    canChangeSalePrice: ["awaiting_shipment", "collecting", "in_transit", "completed"].includes(
      status
    ),
    // Завершение: всегда доступно для in_transit (fallback для auto-tracked)
    canComplete: status === "in_transit",
    // Возврат: in_transit — только ручные (API определяет автоматом).
    // completed — все службы (покупатель клиента может оформить возврат после получения).
    canInitiateReturn: status === "completed" || (!autoTracked && status === "in_transit"),
    // Код возврата: только после прибытия на ПВЗ
    canSetReturnCode: status === "return_arrived",
    // Продление забора: return_arrived, все службы (14 дней — страховочный таймер)
    canExtendReturnDeadline: status === "return_arrived",
    // Восстановление из утиля: клиент договорился с Avito о возврате на ПВЗ
    canRestoreFromTrash: status === "trash",
  };
}
