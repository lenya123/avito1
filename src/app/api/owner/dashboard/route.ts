import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Хелпер для получения сессии владельца
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

export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Даты для фильтрации
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekAgo = new Date(todayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Параллельно выполняем все запросы
    const [
      // Заказы сегодня
      todayOrdersResult,
      // Заказы вчера (для сравнения)
      yesterdayOrdersResult,
      // Новые клиенты сегодня
      todayClientsResult,
      // Новые клиенты вчера
      yesterdayClientsResult,
      // Заказы за неделю (для графика)
      weekOrdersResult,
      // Долги +ВАЙБ
      debtsResult,
      // Товары с низким остатком
      lowStockResult,
      // Сгорающие заказы (дедлайн сегодня)
      urgentOrdersResult,
      // Топ товаров за неделю
      topProductsResult,
      // Топ клиентов за неделю
      topClientsResult,
      // Последние заказы
      recentOrdersResult,
      // Общая статистика клиентов
      clientsStatsResult,
    ] = await Promise.all([
      // Заказы сегодня
      supabase
        .from("orders")
        .select("client_price, purchase_price")
        .gte("created_at", todayStart.toISOString()),

      // Заказы вчера
      supabase
        .from("orders")
        .select("client_price, purchase_price")
        .gte("created_at", yesterdayStart.toISOString())
        .lt("created_at", todayStart.toISOString()),

      // Новые клиенты сегодня
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "client")
        .gte("created_at", todayStart.toISOString()),

      // Новые клиенты вчера
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "client")
        .gte("created_at", yesterdayStart.toISOString())
        .lt("created_at", todayStart.toISOString()),

      // Заказы за неделю
      supabase
        .from("orders")
        .select("created_at, client_price, purchase_price")
        .gte("created_at", weekAgo.toISOString())
        .order("created_at", { ascending: true }),

      // Долги +ВАЙБ (клиенты с отрицательным депозитом)
      supabase
        .from("users")
        .select("id, telegram_username, deposit")
        .eq("role", "client")
        .eq("is_vibe_plus", true)
        .lt("deposit", 0),

      // Товары с низким остатком
      supabase
        .from("product_sizes")
        .select("product_id, size, current_quantity, products(name)")
        .lte("current_quantity", 5)
        .gt("current_quantity", 0),

      // Сгорающие заказы
      supabase
        .from("orders")
        .select(
          "id, order_number, delivery_deadline, client_id, users!orders_client_id_fkey(telegram_username)"
        )
        .in("status", ["awaiting_shipment", "collecting"])
        .lte(
          "delivery_deadline",
          new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString()
        )
        .gte("delivery_deadline", todayStart.toISOString()),

      // Топ товаров (по количеству заказов за неделю)
      supabase
        .from("orders")
        .select("product_id, client_price, products(name, photo_urls)")
        .gte("created_at", weekAgo.toISOString()),

      // Топ клиентов
      supabase
        .from("orders")
        .select("client_id, client_price, users!orders_client_id_fkey(telegram_username)")
        .gte("created_at", weekAgo.toISOString()),

      // Последние 5 заказов
      supabase
        .from("orders")
        .select(
          `
          id,
          order_number,
          status,
          client_price,
          created_at,
          products(name, photo_urls),
          users!orders_client_id_fkey(telegram_username)
        `
        )
        .order("created_at", { ascending: false })
        .limit(5),

      // Статистика клиентов
      supabase
        .from("users")
        .select("id, subscription_tier, is_vibe_plus, is_blocked")
        .eq("role", "client"),
    ]);

    // Обработка данных
    const todayOrders = todayOrdersResult.data || [];
    const yesterdayOrders = yesterdayOrdersResult.data || [];

    // Метрики сегодня
    const todayOrdersCount = todayOrders.length;
    const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.client_price || 0), 0);
    const todayProfit = todayOrders.reduce(
      (sum, o) => sum + ((o.client_price || 0) - (o.purchase_price || 0)),
      0
    );

    // Метрики вчера
    const yesterdayOrdersCount = yesterdayOrders.length;
    const yesterdayRevenue = yesterdayOrders.reduce((sum, o) => sum + (o.client_price || 0), 0);
    const yesterdayProfit = yesterdayOrders.reduce(
      (sum, o) => sum + ((o.client_price || 0) - (o.purchase_price || 0)),
      0
    );

    // Рассчитываем изменения
    const ordersChange =
      yesterdayOrdersCount > 0
        ? Math.round(((todayOrdersCount - yesterdayOrdersCount) / yesterdayOrdersCount) * 100)
        : todayOrdersCount > 0
          ? 100
          : 0;

    const revenueChange =
      yesterdayRevenue > 0
        ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
        : todayRevenue > 0
          ? 100
          : 0;

    const profitChange =
      yesterdayProfit > 0
        ? Math.round(((todayProfit - yesterdayProfit) / yesterdayProfit) * 100)
        : todayProfit > 0
          ? 100
          : 0;

    const todayNewClients = todayClientsResult.count || 0;
    const yesterdayNewClients = yesterdayClientsResult.count || 0;
    const clientsChange =
      yesterdayNewClients > 0
        ? Math.round(((todayNewClients - yesterdayNewClients) / yesterdayNewClients) * 100)
        : todayNewClients > 0
          ? 100
          : 0;

    // График за неделю
    const weekOrders = weekOrdersResult.data || [];
    const chartData: Record<string, { orders: number; revenue: number }> = {};

    for (let i = 6; i >= 0; i--) {
      const date = new Date(todayStart);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];
      chartData[dateKey] = { orders: 0, revenue: 0 };
    }

    weekOrders.forEach((order) => {
      const dateKey = order.created_at?.split("T")[0];
      if (dateKey && chartData[dateKey]) {
        chartData[dateKey].orders += 1;
        chartData[dateKey].revenue += order.client_price || 0;
      }
    });

    const weekChart = Object.entries(chartData).map(([date, data]) => ({
      date,
      orders: data.orders,
      revenue: data.revenue,
    }));

    // Долги +ВАЙБ
    const debts = debtsResult.data || [];
    const totalDebt = debts.reduce((sum, d) => sum + Math.abs(d.deposit || 0), 0);
    const debtorsCount = debts.length;

    // Алерты
    const alerts = [];

    const urgentOrders = urgentOrdersResult.data || [];
    if (urgentOrders.length > 0) {
      alerts.push({
        type: "urgent" as const,
        title: "Сгорающие заказы",
        message: `${urgentOrders.length} заказ(ов) с дедлайном сегодня`,
        count: urgentOrders.length,
      });
    }

    if (totalDebt > 0) {
      alerts.push({
        type: "warning" as const,
        title: "Долги +ВАЙБ",
        message: `${debtorsCount} должник(ов) на сумму ${totalDebt.toLocaleString("ru-RU")} ₽`,
        count: debtorsCount,
        amount: totalDebt,
      });
    }

    const lowStockItems = lowStockResult.data || [];
    if (lowStockItems.length > 0) {
      alerts.push({
        type: "warning" as const,
        title: "Заканчивается товар",
        message: `${lowStockItems.length} позиций с остатком < 5 шт.`,
        count: lowStockItems.length,
      });
    }

    // Топ товаров
    const productOrders = topProductsResult.data || [];
    const productStats: Record<
      string,
      { name: string; photo: string | null; orders: number; revenue: number }
    > = {};

    productOrders.forEach((order) => {
      if (!order.product_id) return;
      if (!productStats[order.product_id]) {
        const product = order.products as { name: string; photo_urls: string[] | null } | null;
        productStats[order.product_id] = {
          name: product?.name || "Неизвестно",
          photo: product?.photo_urls?.[0] || null,
          orders: 0,
          revenue: 0,
        };
      }
      productStats[order.product_id].orders += 1;
      productStats[order.product_id].revenue += order.client_price || 0;
    });

    const topProducts = Object.entries(productStats)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 5);

    // Топ клиентов
    const clientOrders = topClientsResult.data || [];
    const clientStats: Record<
      string,
      { username: string | null; orders: number; revenue: number }
    > = {};

    clientOrders.forEach((order) => {
      if (!order.client_id) return;
      if (!clientStats[order.client_id]) {
        const user = order.users as { telegram_username: string | null } | null;
        clientStats[order.client_id] = {
          username: user?.telegram_username || null,
          orders: 0,
          revenue: 0,
        };
      }
      clientStats[order.client_id].orders += 1;
      clientStats[order.client_id].revenue += order.client_price || 0;
    });

    const topClients = Object.entries(clientStats)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Последние заказы
    const recentOrders = (recentOrdersResult.data || []).map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      price: order.client_price,
      createdAt: order.created_at,
      productName: (order.products as { name: string } | null)?.name,
      productPhoto: (order.products as { photo_urls: string[] | null } | null)?.photo_urls?.[0],
      clientUsername: (order.users as { telegram_username: string | null } | null)
        ?.telegram_username,
    }));

    // Статистика клиентов
    const allClients = clientsStatsResult.data || [];
    const clientsStats = {
      total: allClients.length,
      active: allClients.filter((c) => !c.is_blocked).length,
      premium: allClients.filter(
        (c) => c.subscription_tier === "premium" || c.subscription_tier === "top_floor_boss"
      ).length,
      vibePlus: allClients.filter((c) => c.is_vibe_plus).length,
    };

    return NextResponse.json({
      today: {
        orders: todayOrdersCount,
        ordersChange,
        revenue: todayRevenue,
        revenueChange,
        profit: todayProfit,
        profitChange,
        newClients: todayNewClients,
        clientsChange,
      },
      weekChart,
      alerts,
      debts: {
        total: totalDebt,
        count: debtorsCount,
        list: debts.map((d) => ({
          id: d.id,
          username: d.telegram_username,
          debt: Math.abs(d.deposit || 0),
        })),
      },
      topProducts,
      topClients,
      recentOrders,
      clientsStats,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
