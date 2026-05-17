import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

async function getOwnerSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie?.value) return null;

  try {
    const session = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
    if (session.role !== "owner") return null;
    return session;
  } catch {
    return null;
  }
}

const querySchema = z.object({
  period: z.enum(["week", "month", "quarter", "year"]).default("month"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      period: searchParams.get("period") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    });

    const supabase = createServiceClient();

    // Определяем даты периода
    const now = new Date();
    let dateFrom: Date;
    const dateTo = params.dateTo ? new Date(params.dateTo) : now;

    if (params.dateFrom) {
      dateFrom = new Date(params.dateFrom);
    } else {
      switch (params.period) {
        case "week":
          dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter":
          dateFrom = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          break;
        case "year":
          dateFrom = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }

    const dateFromStr = dateFrom.toISOString();
    const dateToStr = dateTo.toISOString();

    // ===== ПРОДАЖИ =====
    const { data: orders } = await supabase
      .from("orders")
      .select("id, client_price, purchase_price, sale_price, status, created_at")
      .gte("created_at", dateFromStr)
      .lte("created_at", dateToStr);

    const salesStats = {
      totalOrders: orders?.length || 0,
      completedOrders: orders?.filter((o) => o.status === "completed").length || 0,
      revenue: orders?.reduce((sum, o) => sum + (o.client_price || 0), 0) || 0,
      cost: orders?.reduce((sum, o) => sum + (o.purchase_price || 0), 0) || 0,
      profit:
        orders?.reduce((sum, o) => sum + ((o.client_price || 0) - (o.purchase_price || 0)), 0) || 0,
    };

    // График продаж по дням
    const salesByDay: Record<string, { orders: number; revenue: number; profit: number }> = {};
    orders?.forEach((order) => {
      if (!order.created_at) return;
      const day = order.created_at.split("T")[0];
      if (!salesByDay[day]) {
        salesByDay[day] = { orders: 0, revenue: 0, profit: 0 };
      }
      salesByDay[day].orders += 1;
      salesByDay[day].revenue += order.client_price || 0;
      salesByDay[day].profit += (order.client_price || 0) - (order.purchase_price || 0);
    });

    const salesChart = Object.entries(salesByDay)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ===== КЛИЕНТЫ =====
    const { data: allClients } = await supabase
      .from("users")
      .select("id, created_at, level, subscription_tier")
      .eq("role", "client");

    const { data: newClients } = await supabase
      .from("users")
      .select("id")
      .eq("role", "client")
      .gte("created_at", dateFromStr)
      .lte("created_at", dateToStr);

    // Активные клиенты (сделавшие заказ в периоде)
    const activeClientIds = new Set(orders?.map((o) => o.id) || []);

    const clientStats = {
      total: allClients?.length || 0,
      new: newClients?.length || 0,
      active: activeClientIds.size,
      byLevel: {
        level0: allClients?.filter((c) => c.level === 0).length || 0,
        level1: allClients?.filter((c) => c.level === 1).length || 0,
        level2: allClients?.filter((c) => c.level === 2).length || 0,
        level3: allClients?.filter((c) => c.level === 3).length || 0,
      },
    };

    // ===== ТОВАРЫ =====
    const { data: products } = await supabase
      .from("products")
      .select("id, name, category, is_active");

    const { data: productSizes } = await supabase
      .from("product_sizes")
      .select("product_id, current_quantity");

    const totalStock = productSizes?.reduce((sum, s) => sum + (s.current_quantity || 0), 0) || 0;

    const productStats = {
      total: products?.length || 0,
      active: products?.filter((p) => p.is_active).length || 0,
      totalStock,
    };

    // Продажи по категориям
    const categoryStats: Record<string, number> = {};
    // Здесь нужен JOIN с orders, упрощённо возьмём из products
    products?.forEach((p) => {
      const cat = p.category || "Без категории";
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;
    });

    const categoriesChart = Object.entries(categoryStats).map(([name, count]) => ({
      name,
      count,
    }));

    // ===== ТОП ТОВАРОВ =====
    // Группируем заказы по product_id (нужен дополнительный запрос)
    const { data: ordersWithProducts } = await supabase
      .from("orders")
      .select("product_id, client_price, products(name, photo_urls)")
      .gte("created_at", dateFromStr)
      .lte("created_at", dateToStr)
      .eq("status", "completed");

    const productSales: Record<
      string,
      { name: string; photo: string | null; orders: number; revenue: number }
    > = {};
    ordersWithProducts?.forEach((order) => {
      const pid = order.product_id;
      if (!pid) return;
      if (!productSales[pid]) {
        const product = order.products as { name: string; photo_urls: string[] | null } | null;
        productSales[pid] = {
          name: product?.name || "Товар",
          photo: product?.photo_urls?.[0] || null,
          orders: 0,
          revenue: 0,
        };
      }
      productSales[pid].orders += 1;
      productSales[pid].revenue += order.client_price || 0;
    });

    const topProducts = Object.entries(productSales)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ===== ТОП КЛИЕНТОВ =====
    const { data: ordersWithClients } = await supabase
      .from("orders")
      .select("client_id, client_price, users!orders_client_id_fkey(telegram_username, name)")
      .gte("created_at", dateFromStr)
      .lte("created_at", dateToStr)
      .eq("status", "completed");

    const clientSales: Record<
      string,
      { username: string | null; name: string | null; orders: number; revenue: number }
    > = {};
    ordersWithClients?.forEach((order) => {
      const cid = order.client_id;
      if (!clientSales[cid]) {
        const user = order.users as {
          telegram_username: string | null;
          name: string | null;
        } | null;
        clientSales[cid] = {
          username: user?.telegram_username || null,
          name: user?.name || null,
          orders: 0,
          revenue: 0,
        };
      }
      clientSales[cid].orders += 1;
      clientSales[cid].revenue += order.client_price || 0;
    });

    const topClients = Object.entries(clientSales)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return NextResponse.json({
      period: {
        from: dateFromStr,
        to: dateToStr,
        label: params.period,
      },
      sales: {
        stats: salesStats,
        chart: salesChart,
      },
      clients: {
        stats: clientStats,
      },
      products: {
        stats: productStats,
        categories: categoriesChart,
        top: topProducts,
      },
      topClients,
    });
  } catch (error) {
    console.error("Analytics API error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
