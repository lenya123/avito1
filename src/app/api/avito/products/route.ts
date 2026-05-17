import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

function getUserIdFromSession(request: NextRequest): string | null {
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie?.value) return null;
  try {
    const sessionData = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
    return sessionData.userId || null;
  } catch {
    return null;
  }
}

// GET — список продуктов для селектора привязки.
// STUB: owner-panel — каталог товаров приходит из панели владельца. В standalone
// это сид-каталог (supabase/seed.sql). При интеграции заменить источник на
// каталог панели; формат ответа сохранить.
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    const supabase = createServiceClient();

    let query = supabase
      .from("products")
      .select("id, name, photo_urls, photo_main_index, drop_price")
      .eq("is_active", true)
      .order("name")
      .limit(20);

    if (search.trim()) {
      query = query.ilike("name", `%${search.trim()}%`);
    }

    const { data: products, error } = await query;

    if (error) {
      console.error("Products search error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    return NextResponse.json({ products: products || [] });
  } catch (error) {
    console.error("Products error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
