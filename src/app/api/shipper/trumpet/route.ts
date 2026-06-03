/**
 * Trumpet — нажатие «Протрубить возвраты» в shipper-PWA.
 *
 * BUSINESS_LOGIC.md §6.4:
 *   - 1 нажатие в день на весь магазин (single-tenant).
 *   - При нажатии: для всех заказов в `return` создаются записи в
 *     return_pickup_attempts на сегодня (result=NULL).
 *   - Партнёрские заказы — пропускаются (партнёр сам себе хозяин).
 *   - Запускается серия trumpet-notify DM-job'ов (см. memory).
 *   - Любой shipper может отменить trumpet (DELETE).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";
import { scheduleTrumpetNotifications, cancelTrumpetNotifications } from "@/lib/jobs";
import { moscowToday } from "@/lib/utils/moscow-time";

const todayMoscowIso = (): string => moscowToday();

export async function POST(request: NextRequest) {
  const session = await getShipperSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const today = todayMoscowIso();

  // 1. Проверяем нет ли активной trumpet-сессии за сегодня.
  const { data: existing } = await supabase
    .from("trumpet_sessions")
    .select("id, triggered_by, triggered_at, cancelled_at")
    .eq("trumpet_date", today)
    .is("cancelled_at", null)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error: "Сегодня уже трубили",
        sessionId: existing.id,
        triggeredAt: existing.triggered_at,
      },
      { status: 409 }
    );
  }

  // 2. Создаём сессию.
  const { data: trumpetSession, error: insertError } = await supabase
    .from("trumpet_sessions")
    .insert({
      trumpet_date: today,
      triggered_by: session.userId,
    })
    .select("id, triggered_at")
    .single();

  if (insertError || !trumpetSession) {
    console.error("[trumpet] insert failed:", insertError);
    return NextResponse.json({ error: "Не удалось создать сессию" }, { status: 500 });
  }

  // 3. Берём все «свои» заказы в return (partner_warehouse пропускаем,
  // owner_warehouse партнёрские проходят как свои).
  const { data: orders } = await supabase
    .from("orders")
    .select("id, customer_id, partner_id")
    .eq("status", "return")
    .eq("source_warehouse", "owner");

  const ownOrders = (orders ?? []).filter((o) => o.customer_id);

  // 4. Создаём попытки на сегодня (result=NULL — формальная отметка).
  if (ownOrders.length > 0) {
    const rows = ownOrders.map((o) => ({
      order_id: o.id as string,
      trumpet_session_id: trumpetSession.id as string,
      attempt_date: today,
      attempted_by: session.userId,
    }));

    const { error: attemptsError } = await supabase.from("return_pickup_attempts").insert(rows);

    if (attemptsError) {
      console.error("[trumpet] insert attempts failed:", attemptsError);
      // Не катастрофа — сессия есть, попытки можно дописать вручную.
    }
  }

  // 5. Планируем trumpet-notify серию для каждого уникального клиента.
  const uniqueCustomers = Array.from(new Set(ownOrders.map((o) => o.customer_id as string)));
  for (const customerId of uniqueCustomers) {
    scheduleTrumpetNotifications(trumpetSession.id as string, customerId).catch((e) =>
      console.error(`[trumpet] schedule failed for ${customerId}:`, e)
    );
  }

  return NextResponse.json({
    sessionId: trumpetSession.id,
    triggeredAt: trumpetSession.triggered_at,
    ordersCount: ownOrders.length,
    customersCount: uniqueCustomers.length,
  });
}

export async function DELETE(request: NextRequest) {
  const session = await getShipperSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const today = todayMoscowIso();

  const { data: trumpetSession } = await supabase
    .from("trumpet_sessions")
    .select("id")
    .eq("trumpet_date", today)
    .is("cancelled_at", null)
    .maybeSingle();

  if (!trumpetSession) {
    return NextResponse.json({ error: "Активной trumpet-сессии нет" }, { status: 404 });
  }

  // 1. Помечаем сессию отменённой.
  await supabase
    .from("trumpet_sessions")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: session.userId })
    .eq("id", trumpetSession.id);

  // 2. Удаляем сегодняшние попытки (с этой сессии).
  await supabase
    .from("return_pickup_attempts")
    .delete()
    .eq("trumpet_session_id", trumpetSession.id);

  // 3. Снимаем все scheduled DM-job'ы (своих + owner_warehouse-партнёрских).
  const { data: orders } = await supabase
    .from("orders")
    .select("customer_id")
    .eq("status", "return")
    .eq("source_warehouse", "owner");
  const uniqueCustomers = Array.from(
    new Set((orders ?? []).map((o) => o.customer_id as string).filter(Boolean))
  );
  for (const customerId of uniqueCustomers) {
    cancelTrumpetNotifications(trumpetSession.id as string, customerId).catch((e) =>
      console.error(`[trumpet] cancel notif failed for ${customerId}:`, e)
    );
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const session = await getShipperSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const today = todayMoscowIso();

  const { data: trumpetSession } = await supabase
    .from("trumpet_sessions")
    .select("id, triggered_at, triggered_by, cancelled_at")
    .eq("trumpet_date", today)
    .is("cancelled_at", null)
    .maybeSingle();

  return NextResponse.json({
    active: !!trumpetSession,
    session: trumpetSession ?? null,
  });
}
