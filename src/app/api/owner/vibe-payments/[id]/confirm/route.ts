/**
 * POST /api/owner/vibe-payments/[id]/confirm
 *
 * Ручное подтверждение +ВАЙБ-платежа (когда auto-confirm не сработал).
 * Ставит confirmed_at=NOW, confirmed_by=session.userId и проставляет
 * is_paid=true для всех заказов из vibe_payment_orders.
 */

import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyCustomerVibePaymentConfirmed } from "@/lib/telegram/notifications";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: payment, error } = await supabase
    .from("vibe_payments")
    .select("id, customer_id, amount, confirmed_at")
    .eq("id", id)
    .single();

  if (error || !payment) {
    return NextResponse.json({ error: "Платёж не найден" }, { status: 404 });
  }
  if (payment.confirmed_at) {
    return NextResponse.json({ error: "Платёж уже подтверждён" }, { status: 400 });
  }

  const { data: links } = await supabase
    .from("vibe_payment_orders")
    .select("order_id")
    .eq("vibe_payment_id", id);

  const orderIds = (links ?? []).map((l) => l.order_id);

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("vibe_payments")
    .update({ confirmed_at: now, confirmed_by: session.userId })
    .eq("id", id);

  if (updateError) {
    console.error("vibe confirm update failed:", updateError);
    return NextResponse.json({ error: "Не удалось подтвердить" }, { status: 500 });
  }

  if (orderIds.length > 0) {
    await supabase
      .from("orders")
      .update({ is_paid: true, paid_at: now, payment_method: "deposit" })
      .in("id", orderIds);
  }

  await supabase.from("activity_log").insert({
    user_id: session.userId,
    action: "vibe_payment_confirm",
    entity_type: "vibe_payment",
    entity_id: id,
    details: { order_ids: orderIds, amount: Number(payment.amount) },
  });

  notifyCustomerVibePaymentConfirmed({
    customerId: payment.customer_id,
    amount: Number(payment.amount),
  }).catch((e) => console.error("notifyCustomerVibePaymentConfirmed failed:", e));

  return NextResponse.json({ success: true });
}
