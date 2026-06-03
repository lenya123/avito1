/**
 * GET /api/avito/autopost/products
 *
 * Возвращает список товаров для автопостинга — с полями,
 * нужными именно для создания объявления (location_city, photo_urls, description).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("products")
      .select("id, name, description, drop_price, photo_urls, location_city, is_active, is_in_stock")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ products: data || [] });
  } catch (error) {
    console.error("Avito autopost products error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
