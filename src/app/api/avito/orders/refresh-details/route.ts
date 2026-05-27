/**
 * POST /api/avito/orders/refresh-details
 * Body: { orderId: string }
 *
 * Обновляет delivery_details для конкретного заказа (адрес почты, код
 * подтверждения, barcode). Avito обновляет confirmCode раз в 24 часа,
 * поэтому UI триггерит этот endpoint при открытии дашборда для каждого
 * заказа с required_action.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { fetchAvitoOrderDetails } from "@/lib/avito/web-client";

const schema = z.object({ orderId: z.string().min(1) });

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;
    if (!session.id) return NextResponse.json({ error: "Avito не подключен" }, { status: 400 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const { orderId } = parsed.data;

    const supabase = createServiceClient();
    const { data: orderRow } = await supabase
      .from("avito_orders")
      .select("session_id")
      .eq("user_id", userId)
      .eq("avito_order_id", orderId)
      .maybeSingle();
    if (!orderRow || !orderRow.session_id) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    const { data: bsess } = await supabase
      .from("avito_browser_sessions")
      .select("cookies, user_agent, proxy_url")
      .eq("id", orderRow.session_id as string)
      .single();
    if (!bsess) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });

    const details = await fetchAvitoOrderDetails(
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cookies: bsess.cookies as any,
        userAgent: bsess.user_agent as string,
        proxyUrl: bsess.proxy_url as string,
      },
      orderId
    );

    if (!details) return NextResponse.json({ details: null });

    await supabase
      .from("avito_orders")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ delivery_details: details } as any)
      .eq("user_id", userId)
      .eq("avito_order_id", orderId);

    return NextResponse.json({ details });
  } catch (error) {
    console.error("[orders/refresh-details] error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
