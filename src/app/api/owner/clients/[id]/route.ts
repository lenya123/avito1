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

// GET - получить детали клиента
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createServiceClient();

    // Получаем клиента
    const { data: client, error: clientError } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .eq("role", "client")
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
    }

    // Получаем статистику заказов
    const { data: orders } = await supabase
      .from("orders")
      .select("id, status, client_price, purchase_price, created_at")
      .eq("client_id", id);

    const ordersStats = {
      total: orders?.length || 0,
      completed: orders?.filter((o) => o.status === "completed").length || 0,
      cancelled: orders?.filter((o) => o.status === "cancelled").length || 0,
      returns:
        orders?.filter((o) =>
          ["return_in_transit", "return_arrived", "return_completed"].includes(o.status || "")
        ).length || 0,
      revenue: orders?.reduce((sum, o) => sum + (o.client_price || 0), 0) || 0,
      avgCheck:
        orders && orders.length > 0
          ? Math.round(orders.reduce((sum, o) => sum + (o.client_price || 0), 0) / orders.length)
          : 0,
    };

    // Получаем последние заказы
    const { data: recentOrders } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        status,
        client_price,
        created_at,
        products(name, photo_urls)
      `
      )
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Получаем данные о +ВАЙБ
    let vibePlusGrantedBy = null;
    if (client.vibe_plus_granted_by) {
      const { data: granter } = await supabase
        .from("users")
        .select("telegram_username, name")
        .eq("id", client.vibe_plus_granted_by)
        .single();
      vibePlusGrantedBy = granter;
    }

    // Получаем реферальную информацию
    const { data: referrer } = client.referred_by
      ? await supabase
          .from("users")
          .select("telegram_username")
          .eq("id", client.referred_by)
          .single()
      : { data: null };

    const { count: referralsCount } = await supabase
      .from("users")
      .select("id", { count: "exact" })
      .eq("referred_by", id);

    return NextResponse.json({
      client: {
        id: client.id,
        telegramId: client.telegram_id,
        telegramUsername: client.telegram_username,
        name: client.name,
        email: client.email,
        phone: client.phone,
        level: client.level,
        discountPercent: client.discount_percent,
        deposit: client.deposit,
        referralDeposit: client.referral_deposit,
        depositLimit: client.deposit_limit,
        isVibePlus: client.is_vibe_plus,
        vibePlusGrantedAt: client.vibe_plus_granted_at,
        vibePlusGrantedBy,
        isBlocked: client.is_blocked,
        blockedReason: client.blocked_reason,
        subscriptionTier: client.subscription_tier,
        subscriptionStart: client.subscription_start,
        subscriptionEnd: client.subscription_end,
        totalCompletedOrders: client.total_completed_orders,
        firstOrderDiscountUsed: client.first_order_discount_used,
        referralCode: client.referral_code,
        referredBy: referrer?.telegram_username || null,
        referralsCount: referralsCount || 0,
        createdAt: client.created_at,
        updatedAt: client.updated_at,
      },
      stats: ordersStats,
      recentOrders: recentOrders?.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        price: o.client_price,
        createdAt: o.created_at,
        productName: (o.products as { name: string } | null)?.name,
        productPhoto: (o.products as { photo_urls: string[] | null } | null)?.photo_urls?.[0],
      })),
    });
  } catch (error) {
    console.error("Client API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// PATCH - обновить клиента
const updateSchema = z.object({
  action: z.enum(["toggle_vibe_plus", "block", "unblock", "update_deposit_limit"]),
  reason: z.string().optional(),
  depositLimit: z.number().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, reason, depositLimit } = updateSchema.parse(body);

    const supabase = createServiceClient();

    // Проверяем что клиент существует
    const { data: client, error: clientError } = await supabase
      .from("users")
      .select("id, is_vibe_plus, is_blocked")
      .eq("id", id)
      .eq("role", "client")
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
    }

    let updateData: Record<string, unknown> = {};

    switch (action) {
      case "toggle_vibe_plus":
        if (client.is_vibe_plus) {
          // Убираем +ВАЙБ
          updateData = {
            is_vibe_plus: false,
            vibe_plus_granted_at: null,
            vibe_plus_granted_by: null,
            deposit_limit: 0,
          };
        } else {
          // Выдаём +ВАЙБ
          updateData = {
            is_vibe_plus: true,
            vibe_plus_granted_at: new Date().toISOString(),
            vibe_plus_granted_by: session.userId,
            deposit_limit: 100000, // Дефолтный лимит
          };
        }
        break;

      case "block":
        updateData = {
          is_blocked: true,
          blocked_reason: reason || "Заблокирован владельцем",
        };
        break;

      case "unblock":
        updateData = {
          is_blocked: false,
          blocked_reason: null,
        };
        break;

      case "update_deposit_limit":
        if (depositLimit === undefined || depositLimit < 0) {
          return NextResponse.json({ error: "Неверный лимит" }, { status: 400 });
        }
        updateData = {
          deposit_limit: depositLimit,
        };
        break;
    }

    const { error: updateError } = await supabase.from("users").update(updateData).eq("id", id);

    if (updateError) {
      console.error("Client update error:", updateError);
      return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
    }

    // Логируем действие
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: `client_${action}`,
      entity_type: "user",
      entity_id: id,
      details: { action, reason, depositLimit },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Client update API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
