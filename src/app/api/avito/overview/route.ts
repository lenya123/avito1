import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { getWebSessionById } from "@/lib/avito";
import { fetchAvitoProfile } from "@/lib/avito/web-client";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { classifyAvitoOrder, emptyOrdersStats } from "@/lib/avito/order-status";

// GET — Avito dashboard overview под ТЗ.
// Существующие поля сохранены (обратная совместимость), добавлены KPI:
// аванс, ср. расход на продвижение/день (нед.), метрики за месяц,
// блок AI-агента (входящие/ответы/конверсия), статистика по заказам.
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;

    if (!session.id) {
      return NextResponse.json({ error: "Avito не подключен" }, { status: 400 });
    }
    const sessionId = session.id;

    const supabase = createServiceClient();
    const loose = createServiceClientLoose();

    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();
    const weekAgoDate = new Date(now.getTime() - 7 * 86400_000)
      .toISOString()
      .slice(0, 10);

    // Профиль через web proxy (рейтинг/имя вживую, если есть сессия)
    const webSession = await getWebSessionById(sessionId);
    let profile: {
      userId: number | null;
      name: string | null;
      rating: number | null;
      reviewsCount: number | null;
    } | null = null;
    if (webSession) {
      try {
        profile = await fetchAvitoProfile(webSession);
      } catch {
        /* не критично — фолбэк на кеш */
      }
    }

    const [
      activeCountRes,
      chatsCount,
      unreadCount,
      itemsStats,
      activeItemIds,
      lastSync,
      sessionRowRes,
      promoRowsRes,
      monthDailyRes,
      ordersRowsRes,
      chatsMonthRes,
      aiStatsRes,
    ] = await Promise.all([
      supabase
        .from("avito_items")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .eq("status", "active"),
      supabase
        .from("avito_chats")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId),
      supabase
        .from("avito_chats")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .gt("unread_count", 0),
      loose
        .from("avito_items")
        .select(
          "views, favorites, contacts, views_today, favorites_today, contacts_today, orders_count, orders_today"
        )
        .eq("session_id", sessionId),
      supabase
        .from("avito_items")
        .select("avito_item_id")
        .eq("session_id", sessionId)
        .eq("status", "active")
        .limit(200),
      supabase
        .from("avito_items")
        .select("synced_at")
        .eq("session_id", sessionId)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Новые колонки сессии — через loose client
      loose
        .from("avito_browser_sessions")
        .select(
          "ad_balance, balance_real, balance_bonus, rating, rating_count, shop_name"
        )
        .eq("id", sessionId)
        .maybeSingle(),
      loose
        .from("avito_promotion_daily")
        .select("amount, date")
        .eq("session_id", sessionId)
        .gte("date", weekAgoDate),
      loose
        .from("avito_item_stats_daily")
        .select("views, favorites, contacts, orders")
        .eq("session_id", sessionId)
        .gte("date", monthAgo.slice(0, 10)),
      loose
        .from("avito_orders")
        .select("status, status_label, created_at_avito")
        .eq("session_id", sessionId)
        .gte("created_at_avito", monthAgo),
      supabase
        .from("avito_chats")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .gte("last_message_at", monthAgo),
      loose
        .from("ai_sales_daily_stats")
        .select("total_incoming, total_approved, total_auto_sent, date")
        .eq("user_id", userId)
        .gte("date", monthAgo.slice(0, 10)),
    ]);

    // --- Кумулятивные тоталы (фолбэк для «за месяц») ---
    let totalViews = 0,
      totalFavorites = 0,
      totalContacts = 0,
      totalOrders = 0;
    for (const it of itemsStats.data ?? []) {
      totalViews += (it.views || 0) + (it.views_today || 0);
      totalFavorites += (it.favorites || 0) + (it.favorites_today || 0);
      totalContacts += (it.contacts || 0) + (it.contacts_today || 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      totalOrders += ((it as any).orders_count || 0) + ((it as any).orders_today || 0);
    }

    // --- Метрики за месяц из дневных срезов (фолбэк → тоталы) ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const daily = (monthDailyRes.data ?? []) as any[];
    const hasDaily = daily.length > 0;
    const sum = (k: string) => daily.reduce((s, r) => s + (r[k] || 0), 0);
    const viewsMonth = hasDaily ? sum("views") : totalViews;
    const favoritesMonth = hasDaily ? sum("favorites") : totalFavorites;
    const contactsMonth = hasDaily ? sum("contacts") : totalContacts;

    // --- Заказы за месяц + классификация ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderRows = (ordersRowsRes.data ?? []) as any[];
    const ordersStats = emptyOrdersStats();
    ordersStats.totalMonth = orderRows.length;
    for (const o of orderRows) {
      switch (classifyAvitoOrder(o.status, o.status_label)) {
        case "active":
          ordersStats.active++;
          break;
        case "successful":
          ordersStats.successful++;
          break;
        case "return_active":
          ordersStats.returnsActive++;
          break;
        case "return_completed":
          ordersStats.returnsCompleted++;
          break;
      }
    }
    const ordersMonth = ordersStats.totalMonth > 0 ? ordersStats.totalMonth : totalOrders;

    // --- Аванс / баланс / рейтинг из кеша сессии ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sRow = (sessionRowRes.data ?? {}) as any;
    const adBalance = sRow.ad_balance != null ? Number(sRow.ad_balance) : null;
    const balanceReal = sRow.balance_real != null ? Number(sRow.balance_real) : null;
    const balanceBonus = sRow.balance_bonus != null ? Number(sRow.balance_bonus) : null;

    // --- Ср. расход на продвижение/день (за последнюю неделю) ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promoRows = (promoRowsRes.data ?? []) as any[];
    const promoSum = promoRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const avgPromoPerDay = Math.round((promoSum / 7) * 100) / 100;

    // --- AI-агент за месяц ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiRows = (aiStatsRes.data ?? []) as any[];
    const aiIncoming = aiRows.reduce((s, r) => s + (r.total_incoming || 0), 0);
    const aiResponses = aiRows.reduce(
      (s, r) => s + (r.total_approved || 0) + (r.total_auto_sent || 0),
      0
    );
    const chatsMonth = chatsMonthRes.count || 0;
    const aiConversion =
      chatsMonth > 0 ? Math.round((ordersMonth / chatsMonth) * 1000) / 10 : 0;

    const rating = profile?.rating != null
      ? { score: profile.rating, total_reviews: profile.reviewsCount ?? 0 }
      : sRow.rating != null
        ? { score: Number(sRow.rating), total_reviews: sRow.rating_count ?? 0 }
        : null;

    return NextResponse.json({
      profile: profile ? { id: profile.userId, name: profile.name } : null,
      shopName: sRow.shop_name || profile?.name || null,
      stats: {
        // Совместимость со старыми компонентами
        totalItems: activeCountRes.count || 0,
        totalViews,
        totalFavorites,
        totalContacts,
        totalChats: chatsCount.count || 0,
        unreadChats: unreadCount.count || 0,
        rating,
        balance:
          balanceReal != null || balanceBonus != null
            ? { real: balanceReal ?? 0, bonus: balanceBonus ?? 0 }
            : null,
        // KPI по ТЗ
        adBalance,
        avgPromoPerDay,
        activeItems: activeCountRes.count || 0,
        viewsMonth,
        favoritesMonth,
        contactsMonth,
        ordersMonth,
        viewsToday: itemsStats.data?.reduce((s, i) => s + (i.views_today || 0), 0) ?? 0,
        contactsToday:
          itemsStats.data?.reduce((s, i) => s + (i.contacts_today || 0), 0) ?? 0,
      },
      aiAgent: {
        incoming: aiIncoming,
        responses: aiResponses,
        conversion: aiConversion, // % заказов от кол-ва переписок (за месяц)
        chatsMonth,
        ordersMonth,
      },
      ordersStats,
      activeItemIds: (activeItemIds.data || []).map(
        (r: { avito_item_id: number }) => r.avito_item_id
      ),
      activeCount: activeItemIds.data?.length ?? 0,
      lastSyncedAt: lastSync.data?.synced_at || null,
    });
  } catch (error) {
    console.error("Avito overview error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
