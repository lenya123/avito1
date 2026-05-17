import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { validateTransition, ALL_STATUSES } from "@/lib/orders/transitions";
import { appendStatusHistory } from "@/lib/orders/status-history";
import type { OrderStatus } from "@/types/database";

// GET - получить детали заказа
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createServiceClient();

    // Получаем заказ
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    // Получаем товар
    const { data: product } = order.product_id
      ? await supabase
          .from("products")
          .select("id, name, brand, photo_urls, drop_price, purchase_price")
          .eq("id", order.product_id)
          .single()
      : { data: null };

    // Получаем клиента
    const { data: client } = await supabase
      .from("users")
      .select("id, telegram_id, telegram_username, name, phone, level, is_vibe_plus")
      .eq("id", order.client_id)
      .single();

    // Получаем отправщика (если назначен)
    let shipper = null;
    if (order.shipped_by) {
      const { data: shipperData } = await supabase
        .from("users")
        .select("id, name, telegram_username")
        .eq("id", order.shipped_by)
        .single();
      shipper = shipperData;
    }

    // Список доступных отправщиков
    const { data: shippers } = await supabase
      .from("users")
      .select("id, name")
      .eq("role", "shipper")
      .order("name");

    // История из activity_log
    const { data: history } = await supabase
      .from("activity_log")
      .select("id, action, details, created_at")
      .eq("entity_id", id)
      .eq("entity_type", "order")
      .order("created_at", { ascending: false });

    return NextResponse.json({
      order: {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        source: order.source,
        clientPrice: order.client_price,
        purchasePrice: order.purchase_price,
        salePrice: order.sale_price,
        clientProfit: order.client_profit,
        size: order.size,
        deliveryService: order.delivery_service,
        deliveryDeadline: order.delivery_deadline,
        trackingNumber: order.tracking_number,
        returnTrackingNumber: order.return_tracking_number,
        pickupPointId: order.pickup_point_id,
        avitoOrderId: order.avito_order_id,
        isPaid: order.is_paid,
        paidAt: order.paid_at,
        paymentMethod: order.payment_method,
        clientComment: order.client_comment,
        systemComment: order.system_comment,
        cancelReason: order.cancel_reason,
        shippedAt: order.shipped_at,
        completedAt: order.completed_at,
        cancelledAt: order.cancelled_at,
        returnCode: order.return_code,
        expectedReturnDate: order.expected_return_date,
        returnCompletedAt: order.return_completed_at,
        trashDeadline: order.trash_deadline,
        barcodeImageUrl: order.barcode_image_url,
        returnBarcodeImageUrl: order.return_barcode_image_url,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      },
      product: product
        ? {
            id: product.id,
            name: product.name,
            brand: product.brand,
            photo: product.photo_urls?.[0] || null,
            dropPrice: product.drop_price,
            purchasePrice: product.purchase_price,
          }
        : null,
      client: client
        ? {
            id: client.id,
            telegramId: client.telegram_id,
            telegramUsername: client.telegram_username,
            name: client.name,
            phone: client.phone,
            level: client.level,
            isVibePlus: client.is_vibe_plus,
          }
        : null,
      shipper: shipper
        ? {
            id: shipper.id,
            name: shipper.name,
            telegramUsername: shipper.telegram_username,
          }
        : null,
      availableShippers:
        shippers?.map((s) => ({
          id: s.id,
          name: s.name || "Без имени",
        })) || [],
      history:
        history?.map((h) => ({
          id: h.id,
          action: h.action,
          details: h.details,
          createdAt: h.created_at,
        })) || [],
    });
  } catch (error) {
    console.error("Order detail API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// PATCH - обновить заказ
const updateOrderSchema = z.object({
  action: z.enum(["change_status", "assign_shipper", "update_tracking", "update_comment"]),
  status: z.enum(ALL_STATUSES as [string, ...string[]]).optional(),
  shipperId: z.string().uuid().optional(),
  trackingNumber: z.string().optional(),
  returnTrackingNumber: z.string().optional(),
  systemComment: z.string().optional(),
  cancelReason: z.string().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = updateOrderSchema.parse(body);

    const supabase = createServiceClient();

    // Проверяем заказ
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, status, status_history, client_id, client_price, is_paid, product_size_id, product_id"
      )
      .eq("id", id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    switch (data.action) {
      case "change_status": {
        if (!data.status) {
          return NextResponse.json({ error: "Статус обязателен" }, { status: 400 });
        }

        // Строгая валидация перехода
        try {
          validateTransition(order.status as OrderStatus, data.status as OrderStatus);
        } catch (e) {
          return NextResponse.json({ error: (e as Error).message }, { status: 400 });
        }

        updateData.status = data.status;
        updateData.status_history = appendStatusHistory(order.status_history, data.status);

        // Устанавливаем временные метки
        if (data.status === "cancelled") {
          updateData.cancelled_at = new Date().toISOString();
          if (data.cancelReason) updateData.cancel_reason = data.cancelReason;
        } else if (data.status === "completed") {
          updateData.completed_at = new Date().toISOString();
        } else if (data.status === "in_transit") {
          updateData.shipped_at = new Date().toISOString();
        } else if (data.status === "return_completed") {
          updateData.return_completed_at = new Date().toISOString();
        }
        break;
      }

      case "assign_shipper": {
        if (!data.shipperId) {
          return NextResponse.json({ error: "ID отправщика обязателен" }, { status: 400 });
        }

        // Проверяем отправщика
        const { data: shipper } = await supabase
          .from("users")
          .select("id")
          .eq("id", data.shipperId)
          .eq("role", "shipper")
          .single();

        if (!shipper) {
          return NextResponse.json({ error: "Отправщик не найден" }, { status: 404 });
        }

        updateData.shipped_by = data.shipperId;
        break;
      }

      case "update_tracking": {
        if (data.trackingNumber !== undefined) {
          updateData.tracking_number = data.trackingNumber;
        }
        if (data.returnTrackingNumber !== undefined) {
          updateData.return_tracking_number = data.returnTrackingNumber;
        }
        break;
      }

      case "update_comment": {
        if (data.systemComment !== undefined) {
          updateData.system_comment = data.systemComment;
        }
        break;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
    }

    const { error: updateError } = await supabase.from("orders").update(updateData).eq("id", id);

    if (updateError) {
      console.error("Order update error:", updateError);
      return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
    }

    // Логируем
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: `order_${data.action}`,
      entity_type: "order",
      entity_id: id,
      details: { action: data.action, ...updateData } as Record<string, string | null>,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Order update API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
