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

// GET - получить детали заказа
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
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
          .select("id, name, photo_urls, drop_price, purchase_price")
          .eq("id", order.product_id)
          .single()
      : { data: null };

    // Avito-заказ без привязки к товару каталога — название/фото из avito_orders
    // (объявление могли удалить, но название заказа осталось → не «Товар удалён»).
    const { data: avitoItem } =
      !product && order.source === "avito" && order.avito_order_id
        ? await supabase
            .from("avito_orders")
            .select("item_title, item_img_url")
            .eq("avito_order_id", order.avito_order_id)
            .maybeSingle()
        : { data: null };

    // Получаем клиента из customers (Stage 2). Может быть NULL для ручных
    // заказов отправщика (customer_id=NULL).
    const { data: client } = order.customer_id
      ? await supabase
          .from("customers")
          .select(
            "id, tg_user_id, telegram_username, name, phone, vibe_enabled, is_frozen, is_blocked"
          )
          .eq("id", order.customer_id)
          .maybeSingle()
      : { data: null };

    // Партнёр (если заказ партнёрский, Stage 3.8+).
    const { data: partner } = order.partner_id
      ? await supabase
          .from("partners")
          .select("id, name, tg_username, tg_user_id")
          .eq("id", order.partner_id)
          .maybeSingle()
      : { data: null };

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

    // Возврат денег на баланс клиента по этому заказу (§6.7/§9.2):
    // авто-кредит при return_done / cancelled / send_by-сгорел либо ручной.
    const { data: balanceCredit } = order.customer_id
      ? await supabase
          .from("customer_balance_history")
          .select("delta, reason, created_at")
          .eq("order_id", id)
          .gt("delta", 0)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

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
        appliedBalance: order.applied_balance ?? 0,
        balanceRefund: balanceCredit
          ? {
              amount: Number(balanceCredit.delta),
              reason: balanceCredit.reason as string,
              date: balanceCredit.created_at as string,
            }
          : null,
        size: order.size,
        deliveryService: order.delivery_service,
        dispatchCity: order.dispatch_city ?? null,
        sendBy: order.send_by,
        trackingNumber: order.tracking_number,
        returnTrackingNumber: order.return_tracking_number,
        pickupPointId: order.pickup_point_id,
        avitoOrderId: order.avito_order_id,
        // Avito-отправка
        avitoDispatchCode: order.avito_dispatch_code ?? null,
        avitoDispatchBarcodeUrl: order.avito_dispatch_barcode_url ?? null,
        avitoSendTillText: order.avito_send_till_text ?? null,
        avitoDeliveryProviderName: order.avito_delivery_provider_name ?? null,
        avitoDeliveryAddress: order.avito_delivery_address ?? null,
        // Avito-возврат
        avitoReturnTrack: order.avito_return_track ?? null,
        avitoReturnBarcodeUrl: order.avito_return_barcode_url ?? null,
        avitoReturnReceiveByText: order.avito_return_receive_by_text ?? null,
        avitoReturnDestroyByText: order.avito_return_destroy_by_text ?? null,
        avitoReturnTrackingUrl: order.avito_return_tracking_url ?? null,
        avitoReturnProviderName: order.avito_return_provider_name ?? null,
        avitoReturnConfirmCodeEnabled: !!order.avito_return_confirm_code_enabled,
        isPaid: order.is_paid,
        paidAt: order.paid_at,
        paymentMethod: order.payment_method,
        confirmedBy: order.confirmed_by ?? null,
        visionOperationId: order.vision_operation_id ?? null,
        visionAmount: order.vision_amount ?? null,
        visionRecipientCardLast4: order.vision_recipient_card_last4 ?? null,
        visionRecipientPhone: order.vision_recipient_phone ?? null,
        visionRecipientIpName: order.vision_recipient_ip_name ?? null,
        clientComment: order.client_comment,
        systemComment: order.system_comment,
        problemType: order.problem_type,
        cancelReason: order.cancel_reason,
        faultParty: order.fault_party,
        faultReason: order.fault_reason,
        shippedAt: order.shipped_at,
        completedAt: order.completed_at,
        cancelledAt: order.cancelled_at,
        returnCode: order.return_code,
        expectedReturnDate: order.expected_return_date,
        returnCompletedAt: order.return_completed_at,
        // §15 Avito timeline:
        deliveredAt: order.delivered_at ?? null,
        returnInitiatedAt: order.return_initiated_at ?? null,
        returnArrivedAt: order.return_arrived_at ?? null,
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
            photo: product.photo_urls?.[0] || null,
            dropPrice: product.drop_price,
            purchasePrice: product.purchase_price,
          }
        : avitoItem?.item_title
          ? {
              id: "",
              name: avitoItem.item_title,
              photo: avitoItem.item_img_url || null,
              dropPrice: null,
              purchasePrice: null,
            }
          : null,
      client: client
        ? {
            id: client.id,
            telegramId: client.tg_user_id,
            telegramUsername: client.telegram_username,
            name: client.name,
            phone: client.phone,
            vibeEnabled: client.vibe_enabled,
            isFrozen: client.is_frozen,
            isBlocked: client.is_blocked,
          }
        : null,
      shipper: shipper
        ? {
            id: shipper.id,
            name: shipper.name,
            telegramUsername: shipper.telegram_username,
          }
        : null,
      partner: partner
        ? {
            id: partner.id,
            name: partner.name,
            tgUsername: partner.tg_username,
            isLinked: !!partner.tg_user_id,
            commissionSnapshot:
              order.partner_commission_snapshot != null
                ? Number(order.partner_commission_snapshot)
                : null,
            requisitesText: order.partner_requisites_text,
            paymentReceivedAt: order.partner_payment_received_at,
            commissionPaidAt: order.partner_commission_paid_at,
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
    const session = await getOwnerSession(request);
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
        "id, status, status_history, customer_id, client_price, is_paid, product_size_id, product_id"
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

        // Устанавливаем временные метки. Канон §4.2: sent / return_done — финальные.
        const now = new Date().toISOString();
        if (data.status === "cancelled") {
          updateData.cancelled_at = now;
          if (data.cancelReason) updateData.cancel_reason = data.cancelReason;
        } else if (data.status === "sent") {
          updateData.shipped_at = now;
        } else if (data.status === "return_done") {
          updateData.return_completed_at = now;
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

    // Stage 3.7: edit summary в супергруппе при смене статуса.
    if (data.action === "change_status") {
      buildSummaryFromOrderId(id)
        .then((summary) => (summary ? editOrderSummary(summary) : undefined))
        .catch((e) => console.error("editOrderSummary failed:", e));
    }

    // Notify customer (Stage 3.6) — fire-and-forget.
    if (data.action === "change_status" && order.customer_id) {
      const orderNumberRow = await supabase
        .from("orders")
        .select("order_number, tracking_number, delivery_service")
        .eq("id", id)
        .single();
      const orderNumber = orderNumberRow.data?.order_number ?? 0;
      if (data.status === "cancelled") {
        notifyCustomerOrderCancelled({
          customerId: order.customer_id,
          orderId: id,
          orderNumber,
          reason: data.cancelReason ?? null,
        }).catch((e) => console.error("notifyCustomerOrderCancelled failed:", e));
      } else if (data.status === "sent") {
        // Канон §4.2: `sent` — финальный успешный (сдан в ПВЗ). Owner вручную
        // выставил `sent` → клиенту уведомление об отправке.
        notifyCustomerOrderShipped({
          customerId: order.customer_id,
          orderId: id,
          orderNumber,
          trackingNumber: orderNumberRow.data?.tracking_number ?? null,
          deliveryService: orderNumberRow.data?.delivery_service ?? null,
        }).catch((e) => console.error("notifyCustomerOrderShipped failed:", e));
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Order update API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
