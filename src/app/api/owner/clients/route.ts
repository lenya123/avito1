import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

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

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  tier: z.enum(["all", "none", "basic", "premium", "top_floor_boss"]).default("all"),
  level: z.coerce.number().min(0).max(3).optional(),
  status: z.enum(["all", "active", "blocked", "vibe_plus"]).default("all"),
  sort: z.enum(["created_at", "orders", "revenue", "deposit"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      tier: searchParams.get("tier") ?? undefined,
      level: searchParams.get("level") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      order: searchParams.get("order") ?? undefined,
    });

    const supabase = createServiceClient();

    // Базовый запрос
    let query = supabase
      .from("users")
      .select(
        `
        id,
        telegram_id,
        telegram_username,
        name,
        email,
        phone,
        role,
        level,
        deposit,
        referral_deposit,
        deposit_limit,
        is_vibe_plus,
        vibe_plus_granted_at,
        is_blocked,
        blocked_reason,
        subscription_tier,
        subscription_end,
        total_completed_orders,
        created_at
      `,
        { count: "exact" }
      )
      .eq("role", "client");

    // Фильтры
    if (params.search) {
      query = query.or(
        `telegram_username.ilike.%${params.search}%,name.ilike.%${params.search}%,email.ilike.%${params.search}%`
      );
    }

    if (params.tier !== "all") {
      query = query.eq("subscription_tier", params.tier);
    }

    if (params.level !== undefined) {
      query = query.eq("level", params.level);
    }

    if (params.status === "active") {
      query = query.eq("is_blocked", false);
    } else if (params.status === "blocked") {
      query = query.eq("is_blocked", true);
    } else if (params.status === "vibe_plus") {
      query = query.eq("is_vibe_plus", true);
    }

    // Сортировка (для orders и revenue нужен отдельный запрос, пока по created_at)
    if (params.sort === "created_at" || params.sort === "deposit") {
      query = query.order(params.sort, { ascending: params.order === "asc" });
    } else {
      // Для других сортировок - по created_at
      query = query.order("created_at", { ascending: false });
    }

    // Пагинация
    const from = (params.page - 1) * params.limit;
    const to = from + params.limit - 1;
    query = query.range(from, to);

    const { data: clients, error, count } = await query;

    if (error) {
      console.error("Clients fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки клиентов" }, { status: 500 });
    }

    // Получаем статистику заказов для каждого клиента
    const clientIds = clients?.map((c) => c.id) || [];
    const { data: ordersStats } = await supabase
      .from("orders")
      .select("client_id, client_price, status")
      .in("client_id", clientIds);

    // Группируем статистику
    const clientStats: Record<
      string,
      { orders: number; revenue: number; completed: number; returns: number }
    > = {};

    ordersStats?.forEach((order) => {
      if (!clientStats[order.client_id]) {
        clientStats[order.client_id] = { orders: 0, revenue: 0, completed: 0, returns: 0 };
      }
      clientStats[order.client_id].orders += 1;
      clientStats[order.client_id].revenue += order.client_price || 0;

      if (order.status === "completed") {
        clientStats[order.client_id].completed += 1;
      }
      if (
        order.status === "return_in_transit" ||
        order.status === "return_arrived" ||
        order.status === "return_completed"
      ) {
        clientStats[order.client_id].returns += 1;
      }
    });

    // Формируем ответ
    const clientsWithStats = clients?.map((client) => ({
      id: client.id,
      telegramId: client.telegram_id,
      telegramUsername: client.telegram_username,
      name: client.name,
      email: client.email,
      phone: client.phone,
      level: client.level,
      deposit: client.deposit,
      referralDeposit: client.referral_deposit,
      depositLimit: client.deposit_limit,
      isVibePlus: client.is_vibe_plus,
      vibePlusGrantedAt: client.vibe_plus_granted_at,
      isBlocked: client.is_blocked,
      blockedReason: client.blocked_reason,
      subscriptionTier: client.subscription_tier,
      subscriptionEnd: client.subscription_end,
      totalCompletedOrders: client.total_completed_orders,
      createdAt: client.created_at,
      stats: clientStats[client.id] || { orders: 0, revenue: 0, completed: 0, returns: 0 },
    }));

    // Общая статистика
    const { data: allClientsStats } = await supabase
      .from("users")
      .select("id, subscription_tier, is_vibe_plus, is_blocked")
      .eq("role", "client");

    const summary = {
      total: allClientsStats?.length || 0,
      active: allClientsStats?.filter((c) => !c.is_blocked).length || 0,
      premium:
        allClientsStats?.filter(
          (c) => c.subscription_tier === "premium" || c.subscription_tier === "top_floor_boss"
        ).length || 0,
      vibePlus: allClientsStats?.filter((c) => c.is_vibe_plus).length || 0,
    };

    return NextResponse.json({
      clients: clientsWithStats,
      pagination: {
        page: params.page,
        limit: params.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / params.limit),
      },
      summary,
    });
  } catch (error) {
    console.error("Clients API error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
