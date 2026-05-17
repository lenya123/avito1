import { NextRequest, NextResponse } from "next/server";
import { createServiceClientLoose } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

/**
 * Заказы с Avito с тегом «заказ с авито» — для ОТДЕЛЬНОЙ страницы панели
 * владельца. По ТЗ список заказов в интерфейс оператора НЕ внедряем; здесь —
 * только seam-эндпоинт, который панель владельца будет потреблять.
 *
 * // STUB: owner-panel — при интеграции заменить авторизацию на панельную
 * и, при необходимости, маппинг в её модель заказов (source='avito').
 */
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") || 100), 500);

    const loose = createServiceClientLoose();
    const { data } = await loose
      .from("avito_orders")
      .select(
        "id, avito_order_id, avito_item_id, item_title, status, status_label, " +
          "cost_total, provider, provider_label, tracking_number, return_code, " +
          "source_tag, created_at_avito, updated_at_avito"
      )
      .eq("user_id", userId)
      .eq("source_tag", "avito")
      .order("created_at_avito", { ascending: false })
      .limit(limit);

    return NextResponse.json({ tag: "заказ с авито", orders: data ?? [] });
  } catch (e) {
    console.error("owner avito-orders error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
