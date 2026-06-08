import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

/**
 * GET /api/avito/products/{productId}/listings
 * Авито-объявления, привязанные к товару каталога (обратный маппинг
 * avito_item_product_mapping.product_id → avito_items). ТЗ §3.2.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    const { productId } = await params;
    const supabase = createServiceClient();

    const { data: maps } = await supabase
      .from("avito_item_product_mapping")
      .select("avito_item_id")
      .eq("user_id", userId)
      .eq("product_id", productId);

    const ids = (maps ?? [])
      .map((m) => (m as { avito_item_id: number }).avito_item_id)
      .filter((v): v is number => v != null);

    if (ids.length === 0) {
      return NextResponse.json({ listings: [] });
    }

    const { data: items } = await supabase
      .from("avito_items")
      .select("avito_item_id, title, price, status, url, image_url, views, favorites")
      .eq("user_id", userId)
      .in("avito_item_id", ids);

    return NextResponse.json({ listings: items ?? [] });
  } catch (e) {
    console.error("[avito/products/listings] error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
