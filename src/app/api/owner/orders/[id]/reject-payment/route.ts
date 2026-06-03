/**
 * POST /api/owner/orders/[id]/reject-payment
 *
 * Владелец отклоняет присланный клиентом чек. Заказ остаётся
 * в статусе pending_payment — клиент может прислать новый чек.
 * В теле можно передать { reason: string } — будет добавлено в уведомление.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyCustomerPaymentRejected } from "@/lib/telegram/notifications";

const bodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  let body: z.infer<typeof bodySchema> = {};
  try {
    body = bodySchema.parse(await request.json().catch(() => ({})));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    throw error;
  }

  const supabase = createServiceClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, is_paid, customer_id, order_number")
    .eq("id", id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }
  if (order.is_paid) {
    return NextResponse.json({ error: "Заказ уже оплачен" }, { status: 400 });
  }

  await supabase.from("activity_log").insert({
    user_id: session.userId,
    action: "order_reject_payment",
    entity_type: "order",
    entity_id: id,
    details: { reason: body.reason ?? null, order_number: order.order_number },
  });

  if (order.customer_id) {
    notifyCustomerPaymentRejected({
      customerId: order.customer_id,
      orderId: id,
      orderNumber: order.order_number,
      reason: body.reason ?? null,
    }).catch((e) => console.error("notifyCustomerPaymentRejected failed:", e));
  }

  return NextResponse.json({ success: true });
}
