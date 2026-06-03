/**
 * POST /api/owner/pending-orders/[id]/confirm-payment
 *
 * §4.1 → 🅐: владелец подтверждает оплату на pending_orders записи.
 * `confirm_pending_order_atomic` создаёт `orders` row, удаляет pending.
 * После этого карточка появляется в группе клиентов.
 *
 * Используется когда Vision auto-confirm не сработал (или его нет
 * для одиночных заказов) и владелец проверяет чек вручную в panel.
 */

import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyCustomerOrderApproved } from "@/lib/telegram/notifications";
import { upsertOrderSummary, buildSummaryFromOrderId } from "@/lib/telegram/orders-group";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: pending, error: fetchError } = await supabase
    .from("pending_orders")
    .select("id, customer_id, order_number, receipt_received_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !pending) {
    return NextResponse.json({ error: "Pending-заказ не найден" }, { status: 404 });
  }

  // Снимаем 10-мин expire-pending-order таймер на всякий случай —
  // confirm_pending_order_atomic удаляет pending, так что job ничего не найдёт,
  // но явное удаление чище.
  const { cancelExpirePendingOrder } = await import("@/lib/jobs/queues");
  cancelExpirePendingOrder(id).catch((e) => console.error("cancelExpirePendingOrder failed:", e));

  const { data: orderIdRaw, error: confirmError } = await supabase
    .rpc("confirm_pending_order_atomic", {
      p_pending_order_id: id,
      p_payment_method: "card",
      p_confirmed_by: "owner",
    })
    .single();

  if (confirmError) {
    console.error("confirm_pending_order_atomic failed:", confirmError);
    return NextResponse.json({ error: "Не удалось подтвердить" }, { status: 500 });
  }

  if (!orderIdRaw) {
    return NextResponse.json(
      { error: "Pending-заказ уже снят (отмена / истёк / подтверждён ранее)" },
      { status: 400 }
    );
  }

  const orderId = orderIdRaw as unknown as string;

  const { data: orderRow } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", orderId)
    .single();

  await supabase.from("activity_log").insert({
    user_id: session.userId,
    action: "pending_order_confirm_payment",
    entity_type: "order",
    entity_id: orderId,
    details: {
      pending_order_id: id,
      order_number: orderRow?.order_number ?? pending.order_number,
    },
  });

  if (pending.customer_id) {
    notifyCustomerOrderApproved({
      customerId: pending.customer_id,
      orderId,
      orderNumber: orderRow?.order_number ?? Number(pending.order_number),
    }).catch((e) => console.error("notifyCustomerOrderApproved failed:", e));
  }

  buildSummaryFromOrderId(orderId)
    .then((summary) => (summary ? upsertOrderSummary(summary) : undefined))
    .catch((e) => console.error("upsertOrderSummary (pending-confirm) failed:", e));

  return NextResponse.json({ success: true, orderId });
}
