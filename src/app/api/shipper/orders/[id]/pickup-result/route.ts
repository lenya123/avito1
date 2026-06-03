/**
 * Результат попытки забора возврата на ПВЗ (BUSINESS_LOGIC §6.4).
 *
 * 4 кнопки результата:
 *   - picked_up        → запускает executeCompleteReturn (return → return_done)
 *   - wrong_code       → попытка засчитывается, заказ остаётся в return
 *   - wrong_tracking   → то же
 *   - not_found        → то же (посылка ещё не доехала)
 *
 * Привязка попытки: сегодняшняя trumpet-сессия (если есть) или прямая отметка
 * (когда shipper пришёл «своими ножками» без trumpet'а).
 *
 * Если result IN ('wrong_code', 'wrong_tracking') — клиенту шлём DM «обновите
 * код/трек, отправщик не смог забрать». Phase D-stage-2 — TODO формулировок.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";
import { executeCompleteReturn } from "@/lib/orders/shipper-actions";
import type { OrderForAction } from "@/lib/orders/shipper-actions";
import { moscowToday } from "@/lib/utils/moscow-time";
import { notifyCustomerPickupAttemptFailed } from "@/lib/telegram/notifications";

const bodySchema = z.object({
  result: z.enum(["picked_up", "wrong_code", "wrong_tracking", "not_found"]),
  note: z.string().max(500).optional(),
});

const todayMoscowIso = (): string => moscowToday();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getShipperSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id: orderId } = await params;
  const body = await request.json();
  const { result, note } = bodySchema.parse(body);

  const supabase = createServiceClient();

  // 1. Загружаем заказ — статус return.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*, product_size:product_sizes(*)")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }
  if ((order.status as string) !== "return") {
    return NextResponse.json({ error: "Заказ не в статусе возврата" }, { status: 409 });
  }

  const today = todayMoscowIso();

  // 2. Сегодняшняя trumpet-сессия (если есть).
  const { data: trumpetSession } = await supabase
    .from("trumpet_sessions")
    .select("id")
    .eq("trumpet_date", today)
    .is("cancelled_at", null)
    .maybeSingle();

  // 3. Upsert попытки за сегодня — обновляем result.
  // Уникальный индекс return_pickup_attempts(order_id, attempt_date) гарантирует
  // одну попытку на день. Если она уже была (trumpet сегодня нажали с null result) —
  // обновляем result; если её ещё не было (shipper сам пришёл) — INSERT.
  const { data: existingAttempt } = await supabase
    .from("return_pickup_attempts")
    .select("id")
    .eq("order_id", orderId)
    .eq("attempt_date", today)
    .maybeSingle();

  if (existingAttempt) {
    await supabase
      .from("return_pickup_attempts")
      .update({
        result,
        attempted_by: session.userId,
        attempted_at: new Date().toISOString(),
        note: note ?? null,
      })
      .eq("id", existingAttempt.id);
  } else {
    await supabase.from("return_pickup_attempts").insert({
      order_id: orderId,
      trumpet_session_id: trumpetSession?.id ?? null,
      attempt_date: today,
      result,
      attempted_by: session.userId,
      attempted_at: new Date().toISOString(),
      note: note ?? null,
    });
  }

  // 4. Если picked_up — финализируем возврат через общий хелпер.
  if (result === "picked_up") {
    const orderData = order as unknown as OrderForAction;
    const completeResult = await executeCompleteReturn(supabase, orderData, {
      shipperId: session.userId,
    });
    if (!completeResult.success) {
      return NextResponse.json({ error: completeResult.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, result, status: "return_done" });
  }

  // 5. Уведомление клиенту в зависимости от типа неудачи — три текста
  //    (BUSINESS_LOGIC §6.4 + канон 2026-05-26).
  if (result === "wrong_code" || result === "wrong_tracking" || result === "not_found") {
    const customerId = (order.customer_id as string) || null;
    if (customerId) {
      notifyCustomerPickupAttemptFailed({
        customerId,
        orderId: orderId,
        orderNumber: order.order_number as number,
        result,
      }).catch((err) => console.error("[pickup-result] notify failed:", err));
    }
  }

  return NextResponse.json({ ok: true, result, status: "return" });
}
