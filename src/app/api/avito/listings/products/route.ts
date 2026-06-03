import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";
import { getLiveCoverMap } from "@/lib/products/cover";

// GET — список ТОЛЬКО своих товаров для модалки «Создать объявление».
// «Партнёрский товар» (есть хоть одна привязка в product_partner_bindings)
// не показываем — решение владельца: только чисто свои товары.
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    const supabase = createServiceClient();

    let query = supabase
      .from("products")
      .select("id, name, category, description, photo_urls, photo_main_index, drop_price")
      .eq("is_active", true)
      // Исключаем soft-deleted товары: owner-панель удаляет проставляя
      // deleted_at, но НЕ трогает is_active — без этого фильтра удалённый
      // товар продолжал висеть в модалке «Создать объявление» (BUG 4).
      .is("deleted_at", null)
      .order("name")
      .limit(200);

    if (search.trim()) {
      query = query.ilike("name", `%${search.trim()}%`);
    }

    const { data: products, error } = await query;
    if (error) {
      console.error("[avito/listings/products] error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    const candidates = products ?? [];
    const ids = candidates.map((p) => p.id);

    // Исключаем товары с любой партнёрской привязкой (показываем только свои).
    let partnerIds = new Set<string>();
    if (ids.length) {
      const { data: bindings } = await supabase
        .from("product_partner_bindings")
        .select("product_id")
        .in("product_id", ids);
      partnerIds = new Set((bindings ?? []).map((b) => b.product_id as string));
    }

    const own = candidates.filter((p) => !partnerIds.has(p.id)).slice(0, 50);

    // Аватарка товара: живая обложка (avito_media_presets) — тот же источник,
    // что и в меню «Товары». Доп. поле cover_url (или null); клиент падает на
    // photo_urls-fallback сам.
    const coverMap = await getLiveCoverMap(
      supabase,
      own.map((p) => p.id)
    );
    const withCovers = own.map((p) => ({
      ...p,
      cover_url: coverMap.get(p.id) ?? null,
    }));

    return NextResponse.json({ products: withCovers });
  } catch (e) {
    console.error("[avito/listings/products] error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
