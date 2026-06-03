import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";

/** GET — global search across orders, products, clients */
export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ orders: [], products: [], clients: [] });
    }

    const supabase = createServiceClient();
    const limit = 5;

    // Search in parallel
    const isNumeric = /^\d+$/.test(q);
    const searchPattern = `%${q}%`;

    const [ordersResult, productsResult, clientsResult] = await Promise.all([
      // Orders: by order_number or tracking
      isNumeric
        ? supabase
            .from("orders")
            .select("id, order_number, status, client_price")
            .eq("order_number", Number(q))
            .limit(limit)
        : supabase
            .from("orders")
            .select("id, order_number, status, client_price")
            .ilike("tracking_number", searchPattern)
            .limit(limit),

      // Products: by name
      supabase.from("products").select("id, name").ilike("name", searchPattern).limit(limit),

      // Clients: by username or name
      supabase
        .from("users")
        .select("id, telegram_username, name")
        .eq("role", "client")
        .or(`telegram_username.ilike.${searchPattern},name.ilike.${searchPattern}`)
        .limit(limit),
    ]);

    return NextResponse.json({
      orders: (ordersResult.data || []).map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        price: o.client_price,
      })),
      products: (productsResult.data || []).map((p) => ({
        id: p.id,
        name: p.name,
      })),
      clients: (clientsResult.data || []).map((c) => ({
        id: c.id,
        username: c.telegram_username,
        name: c.name,
      })),
    });
  } catch (error) {
    console.error("Owner search error:", error);
    return NextResponse.json({ error: "Ошибка поиска" }, { status: 500 });
  }
}
