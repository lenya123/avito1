import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getWebSessionById } from "@/lib/avito";
import { fetchAvitoProfile } from "@/lib/avito/web-client";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";

// GET — Avito dashboard overview (через web proxy + кешированные данные из БД)
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

    const supabase = createServiceClient();

    // Профиль через web proxy (если есть активная сессия)
    const webSession = await getWebSessionById(session.id);
    let profile: { userId: number | null; name: string | null; rating: number | null; reviewsCount: number | null } | null = null;

    if (webSession) {
      try {
        profile = await fetchAvitoProfile(webSession);
      } catch {
        // Не критично — покажем данные из кеша
      }
    }

    // Кешированные counts из БД (фильтр по session_id)
    const [itemsCount, chatsCount, unreadCount, itemsStats, activeItemIds, lastSync] =
      await Promise.all([
        supabase
          .from("avito_items")
          .select("id", { count: "exact", head: true })
          .eq("session_id", session.id)
          .eq("status", "active"),
        supabase
          .from("avito_chats")
          .select("id", { count: "exact", head: true })
          .eq("session_id", session.id),
        supabase
          .from("avito_chats")
          .select("id", { count: "exact", head: true })
          .eq("session_id", session.id)
          .gt("unread_count", 0),
        supabase
          .from("avito_items")
          .select("views, favorites, contacts, views_today, favorites_today, contacts_today")
          .eq("session_id", session.id),
        supabase
          .from("avito_items")
          .select("avito_item_id")
          .eq("session_id", session.id)
          .eq("status", "active")
          .limit(200),
        supabase
          .from("avito_items")
          .select("synced_at")
          .eq("session_id", session.id)
          .order("synced_at", { ascending: false })
          .limit(1)
          .single(),
      ]);

    // Суммируем просмотры, избранное и контакты
    let totalViews = 0;
    let totalFavorites = 0;
    let totalContacts = 0;
    if (itemsStats.data) {
      for (const item of itemsStats.data) {
        totalViews += (item.views || 0) + (item.views_today || 0);
        totalFavorites += (item.favorites || 0) + (item.favorites_today || 0);
        totalContacts += (item.contacts || 0) + (item.contacts_today || 0);
      }
    }

    return NextResponse.json({
      profile: profile
        ? { id: profile.userId, name: profile.name }
        : null,
      stats: {
        totalItems: itemsCount.count || 0,
        totalViews,
        totalFavorites,
        totalContacts,
        totalChats: chatsCount.count || 0,
        unreadChats: unreadCount.count || 0,
        rating: profile
          ? { score: profile.rating, total_reviews: profile.reviewsCount }
          : null,
        balance: null, // Баланс недоступен через web API
      },
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
