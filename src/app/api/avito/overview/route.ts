import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { getWebSessionById } from "@/lib/avito";
import {
  fetchAvitoProfile,
  fetchAvitoOperationsHistory,
  isAvitoPromoOperation,
} from "@/lib/avito/web-client";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { classifyAvitoOrder, emptyOrdersStats } from "@/lib/avito/order-status";

// GET — Avito dashboard overview под ТЗ.
// Существующие поля сохранены (обратная совместимость), добавлены KPI:
// аванс, ср. расход на продвижение/день (нед.), метрики за месяц,
// блок AI-агента (входящие/ответы/конверсия), статистика по заказам.
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
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
          "avito_item_id, views, favorites, contacts, views_today, favorites_today, contacts_today, orders_count, orders_today"
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
        .select("avito_item_id, date, views, favorites, contacts")
        .eq("session_id", sessionId)
        .gte("date", monthAgo.slice(0, 10)),
      // Берём ВСЕ заказы (без date-окна): «Активные» / «Активные возвраты»
      // не должны зависеть от времени — они по определению в работе.
      loose
        .from("avito_orders")
        .select("status, status_label, created_at_avito")
        .eq("session_id", sessionId),
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

    // «За 30 дней» = SUM реальных дневных строк из avito_item_stats_daily.
    // Эти строки теперь пишутся per-day из /web/1/vas/stats (НЕ кумулятив) —
    // см. sync.ts §2. Просто суммируем окно. Для совсем свежих объявлений Avito
    // отдаёт лишь несколько дней — показываем сколько есть, окно дозревает к 30д.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const daily = (monthDailyRes.data ?? []) as any[];
    let viewsMonth = 0,
      favoritesMonth = 0,
      itemContactsMonth = 0;
    for (const r of daily) {
      viewsMonth += r.views || 0;
      favoritesMonth += r.favorites || 0;
      itemContactsMonth += r.contacts || 0;
    }
    // Фолбэк (история ещё не накопилась — таблица пуста): lifetime-тоталы,
    // чтобы карточки не были пустыми сразу после деплоя/первого sync.
    if (daily.length === 0) {
      viewsMonth = totalViews;
      favoritesMonth = totalFavorites;
      itemContactsMonth = totalContacts;
    }

    // --- Заказы за месяц + классификация ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderRows = (ordersRowsRes.data ?? []) as any[];
    const ordersStats = emptyOrdersStats();
    // «Заказы За 30 дней» — только созданные за последние 30 дней (скользящее окно).
    // active/successful/returns ниже классифицируются по ВСЕМ заказам — они «в работе»
    // по определению и от времени не зависят.
    const monthAgoMs = now.getTime() - 30 * 86400_000;
    ordersStats.totalMonth = orderRows.filter((o) => {
      const t = o.created_at_avito ? new Date(o.created_at_avito).getTime() : NaN;
      return !Number.isNaN(t) && t >= monthAgoMs;
    }).length;
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
    let avgPromoPerDay = Math.round((promoSum / 7) * 100) / 100;

    // --- Расход на ПРОДВИЖЕНИЕ (money.har: /web/1/operations-history) ---
    // Универсально для любого акка: суммируем ТОЛЬКО промо-операции с реальным
    // рублёвым расходом (isAvitoPromoOperation + amountRub>0). В ledger летят ещё
    // комиссии/выводы/тарифы/списания бонусов — их в «продвижение» брать нельзя
    // (иначе на боевых акках карточка завысит). Пагинация по offset (>100 операций
    // не теряем). Окно 30д (широкие диапазоны Avito отдаёт 500). GROSS (возвраты
    // промо не вычитаем). Баланс/«аванс» эндпоинт НЕ отдаёт → из кеша (ad_balance).
    // promoSpendByType — разбивка по типу: первый боевой акк раскроет таксономию.
    let promoSpendMonth = 0;
    const spendByType = new Map<
      string,
      { name: string; sumRub: number; count: number; isPromo: boolean }
    >();
    if (webSession) {
      try {
        const dateFrom = new Date(now.getTime() - 30 * 86400_000).toISOString();
        const dateTo = now.toISOString();
        const weekCut = now.getTime() - 7 * 86400_000;
        let spendWeek = 0;
        const lim = 100;
        let off = 0;
        let truncated = true;
        for (let page = 0; page < 20; page++) {
          const { operations } = await fetchAvitoOperationsHistory(webSession, {
            dateFrom,
            dateTo,
            limit: lim,
            offset: off,
            isIncrease: false,
          });
          for (const op of operations) {
            if (op.isIncrease) continue;
            const promo =
              op.amountRub > 0 && isAvitoPromoOperation(op.operationName, op.operationType);
            // Разбивка по всем списаниям (видно, что вообще есть на акке).
            const key = op.operationType || op.operationName || "—";
            const e =
              spendByType.get(key) ??
              { name: op.operationName || key, sumRub: 0, count: 0, isPromo: false };
            e.sumRub += op.amountRub;
            e.count += 1;
            e.isPromo = e.isPromo || promo;
            spendByType.set(key, e);
            if (!promo) continue;
            promoSpendMonth += op.amountRub;
            const t = new Date(op.paidAt).getTime();
            if (Number.isFinite(t) && t >= weekCut) spendWeek += op.amountRub;
          }
          if (operations.length < lim) {
            truncated = false;
            break;
          }
          off += lim;
        }
        if (truncated) {
          console.warn("[avito/overview] operations-history hit 20-page backstop — spend may undercount");
        }
        // Живые данные есть — берём их (даже 0: значит промо-расхода реально нет).
        avgPromoPerDay = Math.round((spendWeek / 7) * 100) / 100;
      } catch {
        /* не критично — фолбэк на avito_promotion_daily (avgPromoPerDay выше) */
      }
    }
    const promoSpendByType = Array.from(spendByType.entries())
      .map(([type, v]) => ({
        type,
        name: v.name,
        sumRub: Math.round(v.sumRub),
        count: v.count,
        isPromo: v.isPromo,
      }))
      .sort((a, b) => b.sumRub - a.sumRub);

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
        // Расход на продвижение за 30 дней (живой /web/1/operations-history, promo-only).
        promoSpendMonth,
        // Разбивка всех списаний по типу (диагностика таксономии на боевых акках).
        promoSpendByType,
        activeItems: activeCountRes.count || 0,
        viewsMonth,
        favoritesMonth,
        // «Контакты» на дашборде = сколько людей написало (число чатов за 30 дней),
        // а не Avito-метрика «контакты» — так просил владелец.
        contactsMonth: chatsMonth,
        // Avito-метрика «контакты» по объявлениям за 30 дней (vas/stats) — доступна,
        // если UI захочет её отдельно («там контакты тоже есть»).
        itemContactsMonth,
        ordersMonth,
        viewsToday: itemsStats.data?.reduce((s, i) => s + (i.views_today || 0), 0) ?? 0,
        contactsToday: 0,
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
